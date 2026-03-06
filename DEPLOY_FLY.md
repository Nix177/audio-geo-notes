# Deploying Backend to Fly.io

This guide will help you deploy your Node.js backend to Fly.io. This hosting provider is free for small projects and supports persistent storage, which is crucial for saving your audio notes.

## Prerequisites

1.  **Sign up for Fly.io**: Go to [https://fly.io/](https://fly.io/) and create an account. You will need to add a payment method (credit card) to verify your account, but you will not be charged if you stay within the free tier limits (up to 3 small VMs).
2.  **Install flyctl**: This is the command-line tool for Fly.io.

    **Windows (PowerShell):**
    ```powershell
    pwsh -c "iwr https://fly.io/install.ps1 -useb | iex"
    ```

    **Mac/Linux:**
    ```bash
    curl -L https://fly.io/install.sh | sh
    ```
    
    *After installing, restart your terminal to ensure `fly` is in your PATH.*

3.  **Login to Fly.io**:
    ```bash
    fly auth login
    ```

## Deployment Steps

All commands should be run from the root of your project: `audio-geo-notes/`

### 1. Initialize the App

Navigate to the backend directory:
```bash
cd backend
```

Run the launch command:
```bash
fly launch
```

Follow the interactive prompts:
-   **Choose an app name**: (leave blank for a generated name, or type something like `audio-geo-notes-api`)
-   **Select organization**: (Choose your personal organization)
-   **Choose a region**: (Select a region close to you, e.g., `cdg` for Paris, `lhr` for London, `ams` for Amsterdam)
-   **Setup Postgresql?**: **No** (We are using a JSON file)
-   **Setup Redis?**: **No**
-   **Deploy now?**: **No** (We need to configure the volume first!)

### 2. Create Persistent Volume

We need a persistent disk to store `notes.json` and audio files so they aren't lost when the server restarts.

Run this command (replace `audio_geo_data` with any name you like, but keep it consistent):

```bash
fly volumes create audio_geo_data --size 1
```

-   Select the **same region** you chose in step 1.
-   Size is 1GB (free tier includes 3GB total).

### 3. Configure `fly.toml`

After running `fly launch`, a `fly.toml` file was created in the `backend/` folder. Open it and add the `[mounts]` section at the bottom:

```toml
[mounts]
  source = "audio_geo_data"  # Must match the name from step 2
  destination = "/data"      # Where the volume is mounted inside the container
```

**Verify environment variables**:
In your `Dockerfile`, we set `DB_PATH=/data/notes.json` and `UPLOADS_DIR=/data/uploads`. This ensures the app writes to the mounted volume.

### 4. Deploy

Now you can deploy the application:

```bash
fly deploy
```

Wait for the deployment to finish. It will build the Docker image and start the machine.

### 5. Verify and Use

Once deployed, you will get a URL like `https://audio-geo-notes-api.fly.dev`.

1.  **Check health**: Visit `https://your-app-name.fly.dev/api/health`. You should see `{"status":"up"}`.
2.  **Update Frontend**:
    -   Open `index.html` in the root of your project.
    -   Update the API URL:
        ```javascript
        window.VOCAL_WALLS_API_BASE = "https://your-app-name.fly.dev";
        ```
    -   Commit and push your changes to GitHub Pages.

## Troubleshooting

-   **Logs**: If something goes wrong, run `fly logs` to see the server output.
-   **Status**: Run `fly status` to check if the machine is running.
