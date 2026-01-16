# Unified Messaging Dashboard

This is your custom control panel for managing **Grand0360**, **BarhanBeach**, and **Instagram** messages in one place.

## How to use
1.  **Open the Dashboard**:
    - Go to the `unified-dashboard` folder.
    - Double-click `index.html`. It will open in your default browser (Chrome, Edge, etc.).

2.  **Configuration**:
    - Click the **Gear Icon** (Settings) at the bottom left.
    - Enter your **Evolution API URL** and **API Key**.
    - Enter your **Meta (Instagram) Access Token**.
    - Click **Save**.

3.  **Features**:
    - Switch between accounts using the left sidebar icons.
    - Click on a contact to view the chat.
    - (Coming Soon) Real-time message sending/receiving once API keys are connected via the JS logic.

## Technical Note
This dashboard runs entirely in your browser using **Tailwind CSS** and **Vanilla Javascript**. No server installation is required.

**Important**: If you see connection errors when we enable real data, it might be due to "CORS" (browser security). We can solve this by configuring your Evolution API server headers or using a browser extension.
