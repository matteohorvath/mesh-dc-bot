import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  ApplicationCommandOptionType,
  Collection,
  User,
  TextChannel,
  GuildMember,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type { Interaction, CacheType } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { scheduleJob } from "node-schedule";
import fetch from "node-fetch";

// Load environment variables
dotenv.config();

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Interface for book borrowing records
interface BookBorrowing {
  userId: string;
  username: string;
  bookTitle: string;
  borrowDate: string;
  dueDate: string;
  channelId: string;
  guildId: string;
  imageUrl: string; // Store the image URL
}

// File to store borrowing records
const BORROWINGS_FILE = path.join(__dirname, "borrowings.json");

// Function to load borrowings from file
function loadBorrowings(): BookBorrowing[] {
  if (!fs.existsSync(BORROWINGS_FILE)) {
    return [];
  }

  try {
    const data = fs.readFileSync(BORROWINGS_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error loading borrowings:", error);
    return [];
  }
}

// Function to save borrowings to file
function saveBorrowings(borrowings: BookBorrowing[]): void {
  try {
    fs.writeFileSync(BORROWINGS_FILE, JSON.stringify(borrowings, null, 2));
  } catch (error) {
    console.error("Error saving borrowings:", error);
  }
}

// Function to add a new borrowing
function addBorrowing(borrowing: BookBorrowing): void {
  const borrowings = loadBorrowings();
  borrowings.push(borrowing);
  saveBorrowings(borrowings);
}

// Function to check for due books and send notifications
async function checkDueBooks(): Promise<void> {
  const borrowings = loadBorrowings();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const updatedBorrowings: BookBorrowing[] = [];
  console.log("Starting check for due books");

  for (const borrowing of borrowings) {
    if (borrowing.dueDate === today) {
      try {
        // Get the channel
        const channel = (await client.channels.fetch(
          borrowing.channelId
        )) as TextChannel;
        if (channel) {
          // Send notification with image
          await channel.send({
            content: `<@${borrowing.userId}>, your book "${borrowing.bookTitle}" is due today!`,
            files: borrowing.imageUrl ? [borrowing.imageUrl] : [],
          });
          console.log(
            `Sent due notification to ${borrowing.username} for book "${borrowing.bookTitle}"`
          );
        }
      } catch (error) {
        console.error("Error sending due notification:", error);
        // If we couldn't send the notification, keep the borrowing in the list
        updatedBorrowings.push(borrowing);
      }
    } else if (new Date(borrowing.dueDate) > new Date(today)) {
      // Keep future dues
      updatedBorrowings.push(borrowing);
    }
  }

  // Save updated list (without past dues that were notified)
  saveBorrowings(updatedBorrowings);
}

// Popular books for autocomplete suggestions
const popularBooks = [
  "1984",
  "To Kill a Mockingbird",
  "The Great Gatsby",
  "Pride and Prejudice",
  "The Catcher in the Rye",
  "Harry Potter and the Sorcerer's Stone",
  "The Lord of the Rings",
  "The Hobbit",
  "The Hunger Games",
  "The Alchemist",
];

// When the client is ready, register slash commands and set up scheduled checks
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);

  try {
    // Create REST API instance
    const rest = new REST().setToken(process.env.CLIENT_TOKEN || "");

    console.log("Started refreshing application (/) commands.");

    // Register slash commands
    await rest.put(Routes.applicationCommands(readyClient.user.id), {
      body: [
        {
          name: "ping",
          description: "Replies with Pong!",
        },
        {
          name: "book",
          description: "Borrow a book for a specific number of days",
          options: [
            {
              name: "title",
              type: ApplicationCommandOptionType.String,
              description: "The title of the book",
              required: true,
              autocomplete: true,
            },
            {
              name: "days",
              type: ApplicationCommandOptionType.Integer,
              description: "Number of days to borrow the book",
              required: true,
              min_value: 1,
              max_value: 30,
            },
            {
              name: "image",
              type: ApplicationCommandOptionType.Attachment,
              description: "The image of the book",
              required: true,
            },
          ],
        },
        {
          name: "opendoor",
          description: "Opens the door if you have the required role.",
        },
        {
          name: "lockdoor",
          description: "Locks the door if you have the required role.",
        },
      ],
    });

    // Set up daily check for due books (runs at 8am instead of midnight)
    scheduleJob("0 8 * * *", () => {
      console.log("Running scheduled check for due books");
      checkDueBooks();
    });

    // Also check on startup
    await checkDueBooks();

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error("Error refreshing application commands:", error);
  }
});

// Function to create the action row with both door buttons
function createDoorActionRow(): ActionRowBuilder<ButtonBuilder> {
  const openDoorButton = new ButtonBuilder()
    .setCustomId("opendoor_button")
    .setLabel("Open Door")
    .setStyle(ButtonStyle.Primary);

  const lockDoorButton = new ButtonBuilder()
    .setCustomId("lockdoor_button")
    .setLabel("Lock Door")
    .setStyle(ButtonStyle.Secondary); // Use a different style for distinction

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    openDoorButton,
    lockDoorButton
  );
}

// Refactored function to handle the door opening logic
async function handleOpenDoorInteraction(
  interaction: ChatInputCommandInteraction | ButtonInteraction
) {
  try {
    // Use deferReply for buttons as well, ensure it's not ephemeral like the command
    await interaction.deferReply({ ephemeral: false });

    // Ensure the command is used in a guild and the channel is correct
    if (
      !interaction.inGuild() ||
      !interaction.channel ||
      !("name" in interaction.channel) ||
      interaction.channel.name !== "door"
    ) {
      await interaction.editReply(
        "This action can only be performed in the #door channel."
      );
      return;
    }

    // Check user roles (interaction.member should be a GuildMember here)
    const member = interaction.member as GuildMember;
    if (!member) {
      await interaction.editReply("Could not determine your roles.");
      return;
    }
    const hasRequiredRole = member.roles.cache.some(
      (role) =>
        role.name === "BL001" ||
        role.name === "Member" ||
        role.name === "Mentor" ||
        role.name === "door"
    );

    if (!hasRequiredRole) {
      await interaction.editReply(
        "You do not have the required role to open the door."
      );
      return;
    }

    // Roles are okay, attempt to open the door
    console.log(
      `Door opening initiated by ${interaction.user.tag} in channel #${interaction.channel.name}`
    );
    const response = await fetch("http://100.110.75.56:5458/door", {
      method: "GET",
    });

    if (response.ok) {
      console.log("Door opening request sent successfully.");
      // Create the action row with both buttons
      const row = createDoorActionRow();

      await interaction.editReply({
        content:
          "Door opening request sent successfully by " +
          interaction.user.username +
          ". ✅",
        components: [row], // Add the button row here
      });
    } else {
      console.error(
        `Door opening request failed with status: ${response.status}`
      );
      await interaction.editReply(
        `Failed to send door opening request (status: ${response.status}). Please try again or contact an admin.`
      );
    }
  } catch (error) {
    console.error("Error handling opendoor interaction:", error);
    // Always try followup after attempting deferReply, catching potential errors here
    await interaction
      .followUp({
        content: "An error occurred while processing the open door command.",
        ephemeral: true,
      })
      .catch((followUpError) => {
        console.error(
          "Failed to send error followup for open door:",
          followUpError
        );
      });
  }
}

// New function to handle the door locking logic
async function handleLockDoorInteraction(
  interaction: ChatInputCommandInteraction | ButtonInteraction
) {
  try {
    // Use deferReply for buttons as well
    await interaction.deferReply({ ephemeral: false });

    // Ensure the command is used in a guild and the channel is correct
    if (
      !interaction.inGuild() ||
      !interaction.channel ||
      !("name" in interaction.channel) ||
      interaction.channel.name !== "door"
    ) {
      await interaction.editReply(
        "This action can only be performed in the #door channel."
      );
      return;
    }

    // Check user roles
    const member = interaction.member as GuildMember;
    if (!member) {
      await interaction.editReply("Could not determine your roles.");
      return;
    }
    const hasRequiredRole = member.roles.cache.some(
      (role) =>
        role.name === "BL001" ||
        role.name === "Member" ||
        role.name === "Mentor" ||
        role.name === "door"
    );

    if (!hasRequiredRole) {
      await interaction.editReply(
        "You do not have the required role to lock the door."
      );
      return;
    }

    // Roles are okay, attempt to lock the door
    console.log(
      `Door locking initiated by ${interaction.user.tag} in channel #${interaction.channel.name}`
    );
    const response = await fetch("http://100.110.75.56:5458/lock", {
      // Changed endpoint to /lock
      method: "GET",
    });

    if (response.ok) {
      console.log("Door locking request sent successfully.");
      // Create the action row with both buttons
      const row = createDoorActionRow();

      await interaction.editReply({
        content:
          "Door locking request sent successfully by " +
          interaction.user.username +
          ". ✅", // Changed message
        components: [row], // Add the button row here
      });
    } else {
      console.error(
        `Door locking request failed with status: ${response.status}`
      );
      await interaction.editReply(
        `Failed to send door locking request (status: ${response.status}). Please try again or contact an admin.` // Changed message
      );
    }
  } catch (error) {
    console.error("Error handling lockdoor interaction:", error); // Changed message
    // Always try followup after attempting deferReply, catching potential errors here
    await interaction
      .followUp({
        content: "An error occurred while processing the lock door command.", // Changed message
        ephemeral: true,
      })
      .catch((followUpError) => {
        console.error(
          "Failed to send error followup for lock door:",
          followUpError
        ); // Changed message
      });
  }
}

// Handle autocomplete requests
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    if (
      !interaction.channel ||
      !("name" in interaction.channel) ||
      interaction.channel.name !== "library"
    )
      return;

    if (interaction.commandName === "book") {
      const focusedValue = interaction.options.getFocused().toLowerCase();
      const filtered = popularBooks.filter((book) =>
        book.toLowerCase().includes(focusedValue)
      );

      // Return up to 25 matching results
      await interaction.respond(
        filtered.slice(0, 25).map((book) => ({ name: book, value: book }))
      );
    }
    return;
  }

  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "ping") {
      try {
        await interaction.deferReply();
        await interaction.editReply("Pong!");
      } catch (error) {
        console.error("Error responding to ping command:", error);
      }
    } else if (interaction.commandName === "book") {
      try {
        await interaction.deferReply();
        const bookTitle = interaction.options.getString("title");
        const numberOfDays = interaction.options.getInteger("days");
        const attachment = interaction.options.getAttachment("image");

        if (!bookTitle || !numberOfDays) {
          await interaction.editReply(
            "Please provide both a book title and number of days!"
          );
          return;
        }

        if (!attachment) {
          await interaction.editReply("Please provide a book image!");
          return;
        }

        // Calculate due date
        const borrowDate = new Date();
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + numberOfDays);

        // Format dates as YYYY-MM-DD
        const borrowDateStr = borrowDate.toISOString().split("T")[0];
        const dueDateStr = dueDate.toISOString().split("T")[0];

        // Record the borrowing
        addBorrowing({
          userId: interaction.user.id,
          username: interaction.user.username,
          bookTitle,
          borrowDate: borrowDateStr,
          dueDate: dueDateStr,
          channelId: interaction.channelId,
          guildId: interaction.guildId || "",
          imageUrl: attachment.url,
        });

        await interaction.editReply({
          content: `📚 Your borrowing of "${bookTitle}" has been recorded. You will be notified on ${dueDateStr} when it is due to be returned.`,
          files: [attachment],
        });
      } catch (error) {
        console.error("Error responding to book command:", error);
        if (interaction.replied || interaction.deferred) {
          await interaction
            .followUp({
              content: "An error occurred while processing the book command.",
              ephemeral: true,
            })
            .catch(console.error);
        } else {
          await interaction
            .reply({
              content: "An error occurred while processing the book command.",
              ephemeral: true,
            })
            .catch(console.error);
        }
      }
    } else if (interaction.commandName === "opendoor") {
      await handleOpenDoorInteraction(interaction);
    } else if (interaction.commandName === "lockdoor") {
      await handleLockDoorInteraction(interaction);
    }
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId === "opendoor_button") {
      await handleOpenDoorInteraction(interaction);
    } else if (interaction.customId === "lockdoor_button") {
      await handleLockDoorInteraction(interaction);
    }
    return;
  }
});

// We'll keep the message commands for backward compatibility
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (message.content === "!ping") {
    await message.reply("Pong!");
  }

  if (message.content.startsWith("!book ")) {
    if (
      !message.channel ||
      !("name" in message.channel) ||
      message.channel.name !== "library"
    ) {
      await message.reply(
        "The `!book` command can only be used in the #library channel."
      );
      return;
    }

    const bookCommandRegex = /!book\s+"([^"]+)"\s+(\d+)/;
    const match = message.content.match(bookCommandRegex);

    if (match) {
      const bookTitle = match[1];
      const numberOfDays = parseInt(match[2]);

      const attachment = message.attachments.first();
      if (!attachment) {
        await message.reply("Please attach an image of the book!");
        return;
      }

      const borrowDate = new Date();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + numberOfDays);

      const borrowDateStr = borrowDate.toISOString().split("T")[0];
      const dueDateStr = dueDate.toISOString().split("T")[0];

      addBorrowing({
        userId: message.author.id,
        username: message.author.username,
        bookTitle,
        borrowDate: borrowDateStr,
        dueDate: dueDateStr,
        channelId: message.channelId,
        guildId: message.guildId || "",
        imageUrl: attachment.url,
      });

      await message.reply({
        content: `📚 Your borrowing of "${bookTitle}" has been recorded. You will be notified on ${dueDateStr} when it is due to be returned.`,
        files: [attachment],
      });
    } else {
      await message.reply(
        'Please use the correct format: !book "name of the book" numberOfDays and attach an image of the book, or try the /book slash command with autocomplete!'
      );
    }
  }
});

const token = process.env.CLIENT_TOKEN;

if (!token) {
  console.error("Discord bot token not found in environment variables!");
  process.exit(1);
}

client.login(token).catch((error) => {
  console.error("Error logging in to Discord:", error);
});
