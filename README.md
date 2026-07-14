# Thesis Survey Platform

This platform allows researchers to create and deploy surveys that can include AI-powered image and video generation questions using Google's Gemini models.

## Table of Contents

1.  [Prerequisites](#prerequisites)
2.  [Getting the Gemini API Key](#getting-the-gemini-api-key)
3.  [Deployment to Railway](#deployment-to-railway)
4.  [Accessing the Survey Builder](#accessing-the-survey-builder)
5.  [Local Development (Optional)](#local-development-optional)

---

### Prerequisites

*   A [GitHub](https://github.com/) account.
*   A [Railway](https://railway.app/) account.
*   A Google account to access [Google AI Studio](https://aistudio.google.com/).

---

### Getting the Gemini API Key

The platform requires a Google Gemini API key to power the AI generation features.

1.  **Go to Google AI Studio**: Navigate to [https://aistudio.google.com/](https://aistudio.google.com/).
2.  **Get API Key**: Click on the **"Get API key"** button, usually located in the top-right corner.
3.  **Create a New Project**: You will be prompted to create a new project in the Google AI platform. Give it a descriptive name.
4.  **Generate API Key**: Once the project is created, generate a new API key.
5.  **Copy the Key**: Copy this key and keep it safe. You will need it for the environment variables setup in Railway.

**Important**: Ensure the generated API key has the "Generative Language API" enabled. This is typically done by default when creating the key through AI Studio.

---

### Deployment to Railway

Railway is used to host the backend server.

1.  **Fork the Repository**: Start by forking this repository to your own GitHub account.
2.  **Create a New Railway Project**:
    *   Log in to your Railway dashboard.
    *   Click **"New Project"** and select **"Deploy from GitHub repo"**.
    *   Select your forked repository.
3.  **Configure the Service**:
    *   After creation, go to the service's **"Settings"** tab.
    *   Under the **"Service"** section, you can change the **Region**. **Select a US-based region** (e.g., `us-west1`) to ensure the VEO model is available.
4.  **Set Up Environment Variables**:
    *   Go to the **"Variables"** tab for your new service.
    *   Add the following environment variables:

    | Variable Name        | Value                                                                                                                                                           | Description                                                                                                                            |
    | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
    | `GEMINI_API_KEY`     | `Your_Copied_API_Key`                                                                                                                                           | The API key you obtained from Google AI Studio.                                                                                        |
    | `CREATE_PASSWORD`    | `research2025`                                                                                                                                                  | The password required to access the survey creation page. You can change this to any value you prefer.                                 |
    | `GEMINI_VEO_MODEL`   | `veo-3.1-lite-generate-preview`                                                                                                                                 | (Optional) The VEO model to use. Other options include `veo-3.1-fast-generate-preview`. Defaults to the lite version if not set. |
    | `GEMINI_IMAGE_MODEL` | `gemini-2.5-flash-image`                                                                                                                                        | (Optional) The image generation model to use. Defaults to `gemini-2.5-flash-image` if not set.                                       |

5.  **Deploy**: Railway will automatically build and deploy your application. Once the deployment is complete, you can access the live server via the URL provided in the **"Settings"** tab under the **"Domains"** section.

---

### Accessing the Survey Builder

Once the application is deployed and running:

1.  Navigate to the `/create` path of your deployment URL (e.g., `https://your-app-name.up.railway.app/create`).
2.  You will be prompted to enter a password.
3.  The default password is: **`research2025`** (or whatever you set in the `CREATE_PASSWORD` environment variable).

After entering the correct password, you will have access to the survey builder interface.

---

### Local Development (Optional)

If you wish to run the application on your local machine:

1.  **Clone the repository**: `git clone <your-fork-url>`
2.  **Install Backend Dependencies**:
    ```bash
    cd src/backend
    npm install
    ```
3.  **Install Frontend Dependencies**:
    ```bash
    cd ../client
    npm install
    ```
4.  **Create Environment File**:
    *   In the `src/backend` directory, create a file named `.env`.
    *   Add your variables to this file:
        ```
        GEMINI_API_KEY=Your_Copied_API_Key
        CREATE_PASSWORD=research2025
        GEMINI_VEO_MODEL=veo-3.1-lite-generate-preview
        GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
        ```
5.  **Run the Application**:
    *   From the root directory, you can use a tool like `concurrently` to run both the frontend and backend at the same time, or run them in separate terminal windows.
    *   **Backend**: `npm start` (from `src/backend`)
    *   **Frontend**: `npm run dev` (from `src/client`)
