# Use a lightweight Node.js image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install dependencies (ci for clean install)
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Create a directory for persistent data (database and uploads)
# This will be mounted as a volume in Fly.io
RUN mkdir -p /data/uploads

# Set environment variables for persistence
ENV DB_PATH=/data/notes.json
ENV UPLOADS_DIR=/data/uploads
ENV PORT=4000

# Expose the API port
EXPOSE 4000

# Command to start the application
CMD ["npm", "start"]
