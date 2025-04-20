# Simple Discord Bot

A simple Discord bot that connects to a server using an environment variable.

## Setup

1. Create a Discord bot application at [Discord Developer Portal](https://discord.com/developers/applications)
2. In the Bot section, get your bot token
3. Ensure the `.env` file contains your bot token as `CLIENT_TOKEN=your_token_here`
4. Add the bot to your server using the OAuth2 URL Generator (select bot scope and appropriate permissions)

## Running the Bot

```bash
# Install dependencies
bun install

# Run the bot
bun run index.ts
```

## Docker Support

### Building the Docker Image

```bash
docker build -t discord-bot .
```

### Running with Docker

1. Create a .env file with your Discord bot token:
```bash
echo "CLIENT_TOKEN=your_discord_bot_token_here" > .env
```

2. Run the container:
```bash
docker run --env-file .env discord-bot
```

Alternatively, you can provide the token directly:
```bash
docker run -e CLIENT_TOKEN=your_discord_bot_token_here discord-bot
```

## Commands

- `!ping` - Bot responds with "Pong!"

## Adding More Commands

To add more commands, edit the `index.ts` file and add more conditions in the `MessageCreate` event handler.
