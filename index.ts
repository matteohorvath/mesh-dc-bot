import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  ApplicationCommandOptionType,
  Collection,
} from "discord.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

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

// When the client is ready, register slash commands
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
      ],
    });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error("Error refreshing application commands:", error);
  }
});

// Handle autocomplete requests
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isAutocomplete()) return;

  // Check if the interaction is in the library channel
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
});

// Handle slash command interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    try {
      await interaction.deferReply();
      await interaction.editReply("Pong!");
    } catch (error) {
      console.error("Error responding to ping command:", error);
    }
  }

  if (interaction.commandName === "book") {
    try {
      await interaction.deferReply();
      const bookTitle = interaction.options.getString("title");
      const numberOfDays = interaction.options.getInteger("days");
      const attachment = interaction.options.getAttachment("image");

      if (!attachment) {
        await interaction.editReply("Please provide a book image!");
        return;
      }

      await interaction.editReply({
        content: `📚 Your borrowing of "${bookTitle}" has been recorded. You will be notified in ${numberOfDays} days when it is due to be returned.`,
        files: [attachment],
      });
    } catch (error) {
      console.error("Error responding to book command:", error);
    }
  }
});

// We'll keep the message commands for backward compatibility
client.on(Events.MessageCreate, async (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  // Simple ping command
  if (message.content === "!ping") {
    await message.reply("Pong!");
  }

  // Book borrowing command
  if (message.content.startsWith("!book ")) {
    // Extract book title (in quotes) and number of days
    const bookCommandRegex = /!book\s+"([^"]+)"\s+(\d+)/;
    const match = message.content.match(bookCommandRegex);

    if (match) {
      const bookTitle = match[1];
      const numberOfDays = parseInt(match[2]);

      await message.reply(
        `📚 Your borrowing of "${bookTitle}" has been recorded. You will be notified in ${numberOfDays} days when it is due to be returned.`
      );
    } else {
      await message.reply(
        'Please use the correct format: !book "name of the book" numberOfDays or try the /book slash command with autocomplete!'
      );
    }
  }
});

// Get token from environment variable
const token = process.env.CLIENT_TOKEN;

if (!token) {
  console.error("Discord bot token not found in environment variables!");
  process.exit(1);
}

// Login to Discord with the token
client.login(token).catch((error) => {
  console.error("Error logging in to Discord:", error);
});
