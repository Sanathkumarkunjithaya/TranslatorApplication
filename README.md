# Multilingual Chat & Speech Application

A real-time chat application with speech recognition and translation capabilities supporting English, Japanese, Hindi, and Spanish.

## Features

- **Real-time Chat**: Connect to rooms and chat with multiple users
- **Speech Recognition**: Speak and have your speech transcribed automatically
- **Multi-language Support**: Supports English, Japanese, Hindi, and Spanish
- **Auto-translation**: Messages and speech are automatically translated to each user's preferred language
- **Room-based Chat**: Create or join specific chat rooms

## Technology Stack

- **Backend**: Python Flask with SocketIO for real-time communication
- **Frontend**: React with TypeScript
- **Translation**: Google Translate API
- **Speech Recognition**: Web Speech API (browser-based)

## Setup Instructions

### Prerequisites

- Python 3.7+
- Node.js 14+
- npm

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create and activate virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Running the Application

### Option 1: Using Scripts (Recommended)

1. Start the backend server:
   ```bash
   ./start_backend.sh
   ```

2. In a new terminal, start the frontend:
   ```bash
   ./start_frontend.sh
   ```

### Option 2: Manual Start

1. Start the Flask backend:
   ```bash
   cd backend
   source venv/bin/activate
   python app.py
   ```

2. In a new terminal, start the React frontend:
   ```bash
   cd frontend
   npm start
   ```

The application will be available at:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

## How to Use

1. **Join a Room**:
   - Enter your username
   - Select your preferred language
   - Enter a room ID (or create a new one)
   - Click "Join Room"

2. **Chat**:
   - Type messages in the text input and press Enter or click Send
   - Messages will be automatically translated for users with different language preferences
   - Translated messages are highlighted in green

3. **Speech Recognition**:
   - Click the "🎤 Speak" button to start speech recognition
   - Speak clearly in your selected language
   - Your speech will be transcribed and sent to other users
   - Speech messages are marked with a microphone icon

4. **Language Support**:
   - English (US)
   - Japanese (Japan)
   - Hindi (India)
   - Spanish (Spain)

## Browser Compatibility

- Speech recognition requires a modern browser with Web Speech API support
- Works best in Chrome and Edge
- Firefox has limited support
- Safari has partial support

## Troubleshooting

1. **Speech Recognition Not Working**:
   - Ensure you're using a supported browser
   - Check microphone permissions
   - Make sure you're on HTTPS (required for speech recognition in production)

2. **Translation Issues**:
   - Translation requires internet connection
   - Google Translate API has rate limits

3. **Connection Issues**:
   - Ensure both frontend and backend are running
   - Check that ports 3000 and 5000 are available

## Deployment

### Railway Deployment (Recommended)

1. **Deploy Backend:**
   - Go to [Railway](https://railway.app)
   - Create new project from GitHub repo
   - Set environment variables:
     - `CARTESIA_API_KEY=your_api_key`
     - `PORT=5000`
   - Deploy will auto-start

2. **Deploy Frontend:**
   - Build frontend: `cd frontend && npm run build`
   - Deploy to Netlify/Vercel with env var:
     - `REACT_APP_API_URL=https://your-backend-url.railway.app`

### Quick Railway Setup

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway new
railway up
```

Your backend will be available at: `https://your-project.railway.app`

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:
- `CARTESIA_API_KEY` - Your Cartesia TTS API key
- `REACT_APP_API_URL` - Backend URL for frontend

## Security Notes

- This is a development setup
- For production, implement proper authentication
- Use HTTPS for speech recognition
- Secure the Flask secret key
- Consider rate limiting and input validation# Translation
