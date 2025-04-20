FROM oven/bun:latest

WORKDIR /app

# Copy package.json and lockfile
COPY .env package.json bun.lockb ./

# Install dependencies
RUN bun install

# Copy the rest of the application
COPY . .

# Don't use .env in production
ENV NODE_ENV=production

# Expose any necessary ports (if applicable)
# EXPOSE 3000

# Run the bot
CMD ["bun", "run", "start"] 