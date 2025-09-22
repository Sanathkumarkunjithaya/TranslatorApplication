from flask import Flask, request, jsonify, send_file
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
from deep_translator import GoogleTranslator
import uuid
import os
import tempfile
import asyncio
import threading
from pathlib import Path
import json
from datetime import datetime

try:
    from cartesia import Cartesia
    CARTESIA_AVAILABLE = True
except ImportError:
    print("Cartesia not available - TTS will be disabled")
    CARTESIA_AVAILABLE = False

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    print("Google Generative AI not available - Meeting minutes will be disabled")
    GEMINI_AVAILABLE = False

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Cartesia configuration
CARTESIA_API_KEY = os.getenv('CARTESIA_API_KEY', 'sk_car_JuNFxXVLx5y36AajKvsy95')
cartesia_client = None

if CARTESIA_AVAILABLE and CARTESIA_API_KEY:
    try:
        cartesia_client = Cartesia(api_key=CARTESIA_API_KEY)
        print("✅ Cartesia TTS initialized")
    except Exception as e:
        print(f"❌ Cartesia initialization failed: {e}")
        cartesia_client = None
else:
    print("⚠️ Cartesia not configured - using browser TTS fallback")

# Gemini configuration
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', 'AIzaSyB6gkjaKhoRScSNmtcBdCDXJtaM8G_IfpE')
gemini_model = None

if GEMINI_AVAILABLE and GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        gemini_model = genai.GenerativeModel('models/gemini-1.5-flash')
        print("✅ Gemini AI (1.5-flash) initialized")
    except Exception as e:
        print(f"❌ Gemini initialization failed: {e}")
        gemini_model = None
else:
    print("⚠️ Gemini not configured - check API key")

# Voice profiles - you can add your own voice IDs here
VOICE_PROFILES = {
    'default': 'a167e0f3-df7e-4d52-a9c3-f949145efdab',  # Default Cartesia voice
    'custom': "387348de-14ee-4061-b4e8-5f1042b9fe69"  # Your cloned voice ID
}

# Store active rooms, users, and conversations
rooms = {}
users = {}
conversations = {}  # Store conversation history for each room

# Language mapping
lang = {
    'english-us': 'en',
    'english-gb': 'en', 
    'english-in': 'en',
    'spanish': 'es',
    'french-fr': 'fr',
    'german': 'de',
    'japanese': 'ja',
    'hindi': 'hi',
    'chinese-cn': 'zh-CN'
}

# Keep LANGUAGES for backward compatibility
LANGUAGES = lang

@app.route('/')
def index():
    return {'status': 'Flask-SocketIO server running', 'version': '1.0'}

def add_to_conversation(room_id, username, message, message_type='message'):
    """Add a message to the conversation history"""
    if room_id not in conversations:
        conversations[room_id] = {
            'messages': [],
            'start_time': datetime.now().isoformat(),
            'participants': set()
        }
    
    conversations[room_id]['messages'].append({
        'timestamp': datetime.now().isoformat(),
        'username': username,
        'message': message,
        'type': message_type  # 'message' or 'transcription'
    })
    
    conversations[room_id]['participants'].add(username)

def generate_meeting_minutes(room_id, target_language='en'):
    """Generate meeting minutes using Gemini AI in specified language"""
    if not gemini_model:
        return {'error': 'Gemini AI not available'}
    
    if room_id not in conversations:
        return {'error': 'No conversation found for this room'}
    
    conv = conversations[room_id]
    messages = conv['messages']
    
    if not messages:
        return {'error': 'No messages in conversation'}
    
    # Language mapping for user-friendly names
    language_names = {
        'en': 'English',
        'es': 'Spanish', 
        'fr': 'French',
        'de': 'German',
        'ja': 'Japanese',
        'hi': 'Hindi',
        'zh-CN': 'Chinese'
    }
    
    target_lang_name = language_names.get(target_language, 'English')
    
    # Prepare conversation text for Gemini
    conversation_text = f"Meeting started at: {conv['start_time']}\n"
    conversation_text += f"Participants: {', '.join(conv['participants'])}\n\n"
    conversation_text += "Conversation:\n"
    
    for msg in messages:
        conversation_text += f"[{msg['timestamp']}] {msg['username']}: {msg['message']}\n"
    
    # Create prompt for Gemini with language specification
    prompt = f"""
    Please analyze the following meeting conversation and generate professional meeting minutes in {target_lang_name} language using markdown format.

    Include the following sections:
    1. **Meeting Overview** (date, time, participants)
    2. **Key Discussion Points** (main topics discussed)
    3. **Decisions Made** (any conclusions or agreements)
    4. **Action Items** (tasks or next steps, if any)
    5. **Summary** (brief overall summary)

    Important: Generate the entire response in {target_lang_name} language, including section headers and all content.

    Here's the conversation:

    {conversation_text}

    Please format the response in clean markdown and be concise but comprehensive.
    """
    
    try:
        response = gemini_model.generate_content(prompt)
        return {
            'minutes': response.text,
            'language': target_language,
            'conversation_count': len(messages),
            'participants': list(conv['participants']),
            'start_time': conv['start_time'],
            'generated_at': datetime.now().isoformat()
        }
    except Exception as e:
        return {'error': f'Failed to generate minutes: {str(e)}'}

@socketio.on('connect')
def on_connect():
    print(f'User {request.sid} connected')

@socketio.on('disconnect')
def on_disconnect():
    print(f'User {request.sid} disconnected')
    if request.sid in users:
        room_id = users[request.sid]['room']
        if room_id in rooms:
            rooms[room_id]['users'] = [u for u in rooms[room_id]['users'] if u['id'] != request.sid]
            if not rooms[room_id]['users']:
                del rooms[room_id]
            else:
                emit('user_left', {'user_id': request.sid}, room=room_id)
        del users[request.sid]

@socketio.on('join_room')
def on_join_room(data):
    room_id = data['room_id']
    username = data['username']
    language = data['language']
    
    user_id = request.sid
    
    if room_id not in rooms:
        rooms[room_id] = {'users': []}
    
    user_info = {
        'id': user_id,
        'username': username,
        'language': language
    }
    
    print(f"🔍 DEBUG User joining: {username} with language '{language}' -> mapped to '{LANGUAGES.get(language, 'en')}'")
    
    rooms[room_id]['users'].append(user_info)
    users[user_id] = {'room': room_id, 'username': username, 'language': language}
    
    join_room(room_id)
    
    emit('room_joined', {
        'room_id': room_id,
        'users': rooms[room_id]['users']
    })
    
    emit('user_joined', user_info, room=room_id, include_self=False)

@socketio.on('leave_room')
def on_leave_room(data):
    room_id = data['room_id']
    user_id = request.sid
    
    if room_id in rooms and user_id in users:
        rooms[room_id]['users'] = [u for u in rooms[room_id]['users'] if u['id'] != user_id]
        if not rooms[room_id]['users']:
            del rooms[room_id]
        else:
            emit('user_left', {'user_id': user_id}, room=room_id)
        
        leave_room(room_id)
        del users[user_id]

@socketio.on('send_message')
def on_send_message(data):
    user_id = request.sid
    if user_id not in users:
        return
    
    user_info = users[user_id]
    room_id = user_info['room']
    message = data['message']
    
    # Get all users in the room
    room_users = rooms[room_id]['users']
    
    # Add to conversation history
    add_to_conversation(room_id, user_info['username'], message, 'message')
    
    # Send original message to sender with both original and translated (same)
    emit('message_received', {
        'username': user_info['username'],
        'message': message,
        'original_message': message,
        'translated_message': message,
        'original_language': user_info['language'],
        'target_language': user_info['language'],
        'translated': False
    })
    
    # Translate and send to other users
    for user in room_users:
        if user['id'] != user_id:
            target_lang = LANGUAGES.get(user['language'], 'en')
            source_lang = LANGUAGES.get(user_info['language'], 'en')
            
            print(f"🔍 DEBUG Translation: {user_info['username']} ({user_info['language']} -> {source_lang}) to {user['username']} ({user['language']} -> {target_lang})")
            
            if target_lang != source_lang:
                try:
                    translator = GoogleTranslator(source=source_lang, target=target_lang)
                    translated_message = translator.translate(message)
                except Exception as e:
                    print(f"Translation error: {e}")
                    translated_message = message
            else:
                translated_message = message
            
            emit('message_received', {
                'username': user_info['username'],
                'message': translated_message,  # Keep for backward compatibility
                'original_message': message,
                'translated_message': translated_message,
                'original_language': user_info['language'],
                'target_language': user['language'],
                'translated': target_lang != source_lang
            }, room=user['id'])

@socketio.on('speech_transcription')
def on_speech_transcription(data):
    user_id = request.sid
    if user_id not in users:
        return
    
    user_info = users[user_id]
    room_id = user_info['room']
    transcription = data['transcription']
    
    # Get all users in the room
    room_users = rooms[room_id]['users']
    
    # Add to conversation history
    add_to_conversation(room_id, user_info['username'], transcription, 'transcription')
    
    # Send original transcription to sender with both original and translated (same)
    emit('transcription_received', {
        'username': user_info['username'],
        'transcription': transcription,
        'original_transcription': transcription,
        'translated_transcription': transcription,
        'original_language': user_info['language'],
        'target_language': user_info['language'],
        'translated': False
    })
    
    # Translate and send to other users
    for user in room_users:
        if user['id'] != user_id:
            target_lang = LANGUAGES.get(user['language'], 'en')
            source_lang = LANGUAGES.get(user_info['language'], 'en')
            
            print(f"Translation: {user_info['language']} ({source_lang}) -> {user['language']} ({target_lang})")
            
            if target_lang != source_lang:
                try:
                    print(f"Attempting translation with source='{source_lang}', target='{target_lang}'")
                    translator = GoogleTranslator(source=source_lang, target=target_lang)
                    translated_transcription = translator.translate(transcription)
                    print(f"Successfully translated '{transcription}' to '{translated_transcription}'")
                except Exception as e:
                    print(f"Translation error from {source_lang} to {target_lang}: {e}")
                    print(f"Error type: {type(e).__name__}")
                    # Fallback to original text
                    translated_transcription = transcription
            else:
                print(f"Same language ({source_lang}), skipping translation")
                translated_transcription = transcription
            
            emit('transcription_received', {
                'username': user_info['username'],
                'transcription': translated_transcription,  # Keep for backward compatibility
                'original_transcription': transcription,
                'translated_transcription': translated_transcription,
                'original_language': user_info['language'],
                'target_language': user['language'],
                'translated': target_lang != source_lang
            }, room=user['id'])

@app.route('/api/tts', methods=['POST'])
def generate_tts():
    """Generate TTS audio using Cartesia"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        language = data.get('language', 'en')
        voice_profile = data.get('voice_profile', 'default')
        
        # Map unsupported Cartesia languages to supported ones
        cartesia_supported_languages = ['en', 'es', 'fr', 'de', 'ja', 'pt', 'hi', 'ko']
        if language not in cartesia_supported_languages:
            print(f"⚠️ Cartesia doesn't support language '{language}', falling back to 'en'")
            language = 'en'
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
            
        if not cartesia_client:
            return jsonify({'error': 'Cartesia TTS not available'}), 503
            
        # Get voice ID
        voice_id = VOICE_PROFILES.get(voice_profile, VOICE_PROFILES['default'])
        if not voice_id:
            return jsonify({'error': 'Voice profile not configured'}), 400
            
        # Generate TTS audio
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
        temp_filename = temp_file.name
        temp_file.close()
        
        try:
            # Use Cartesia to generate audio
            audio_stream = cartesia_client.tts.bytes(
                model_id="sonic-2",
                transcript=text,
                voice={
                    "mode": "id",
                    "id": voice_id
                },
                output_format={
                    "container": "wav",
                    "encoding": "pcm_s16le",
                    "sample_rate": 24000
                },
                language=language
            )
            
            with open(temp_filename, 'wb') as f:
                for chunk in audio_stream:
                    f.write(chunk)
                    
            # Return the audio file
            return send_file(
                temp_filename,
                mimetype='audio/wav',
                as_attachment=False,
                download_name='tts_audio.wav'
            )
            
        except Exception as e:
            print(f"TTS generation error: {e}")
            if os.path.exists(temp_filename):
                os.unlink(temp_filename)
            return jsonify({'error': f'TTS generation failed: {str(e)}'}), 500
            
    except Exception as e:
        print(f"TTS endpoint error: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/voices', methods=['GET'])
def get_voices():
    """Get available voice profiles"""
    return jsonify({
        'voices': list(VOICE_PROFILES.keys()),
        'cartesia_available': cartesia_client is not None
    })

@app.route('/api/minutes/<room_id>', methods=['GET'])
def get_meeting_minutes(room_id):
    """Generate and return meeting minutes for a room in user's language"""
    try:
        # Get language from query parameter, default to English
        target_language = request.args.get('language', 'en')
        minutes_data = generate_meeting_minutes(room_id, target_language)
        return jsonify(minutes_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/conversation/<room_id>', methods=['GET'])
def get_conversation_status(room_id):
    """Get conversation status for a room"""
    if room_id not in conversations:
        return jsonify({
            'exists': False,
            'message_count': 0,
            'participants': []
        })
    
    conv = conversations[room_id]
    return jsonify({
        'exists': True,
        'message_count': len(conv['messages']),
        'participants': list(conv['participants']),
        'start_time': conv['start_time'],
        'gemini_available': gemini_model is not None
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5050))
    socketio.run(app, debug=False, host='0.0.0.0', port=port)