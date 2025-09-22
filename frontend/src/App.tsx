import React, { useState, useEffect, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import './App.css';

interface User {
  id: string;
  username: string;
  language: string;
}

interface Message {
  username: string;
  message: string;
  original_message?: string;
  translated_message?: string;
  original_language: string;
  target_language?: string;
  translated: boolean;
}

interface Transcription {
  username: string;
  transcription: string;
  original_transcription?: string;
  translated_transcription?: string;
  original_language: string;
  target_language?: string;
  translated: boolean;
}

const LANGUAGES = [
  { code: 'english-us', name: 'English (US)' },
  { code: 'english-gb', name: 'English (UK)' },
  { code: 'english-in', name: 'English (India)' },
  { code: 'spanish', name: 'Spanish' },
  { code: 'french-fr', name: 'French (France)' },
  { code: 'german', name: 'German' },
  { code: 'japanese', name: 'Japanese' },
  { code: 'hindi', name: 'Hindi' },
  { code: 'chinese-cn', name: 'Chinese (Mandarin)' }
];

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [username, setUsername] = useState('');
  const [language, setLanguage] = useState('english-us');
  const [roomId, setRoomId] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [speechBuffer, setSpeechBuffer] = useState<string>('');
  const isPausedRef = useRef(false);
  const speechBufferRef = useRef<string>('');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [voiceProfile, setVoiceProfile] = useState('default');
  const [availableVoices, setAvailableVoices] = useState<string[]>(['default']);
  const [cartesiaAvailable, setCartesiaAvailable] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [microphonePermission, setMicrophonePermission] = useState<string>('unknown');
  
  // Meeting minutes state
  const [showMinutes, setShowMinutes] = useState(false);
  const [meetingMinutes, setMeetingMinutes] = useState<string>('');
  const [isGeneratingMinutes, setIsGeneratingMinutes] = useState(false);
  const [conversationStatus, setConversationStatus] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      
      // Safari-specific configuration
      if (isSafari()) {
        recognitionInstance.continuous = false;
        recognitionInstance.interimResults = false;
        recognitionInstance.maxAlternatives = 1;
      } else {
        recognitionInstance.continuous = false;
        recognitionInstance.interimResults = false;
      }
      
      const langCode = language === 'english-us' ? 'en-US' :
                      language === 'english-gb' ? 'en-GB' :
                      language === 'english-in' ? 'en-IN' :
                      language === 'spanish' ? 'es-ES' :
                      language === 'french-fr' ? 'fr-FR' :
                      language === 'german' ? 'de-DE' :
                      language === 'japanese' ? 'ja-JP' :
                      language === 'hindi' ? 'hi-IN' :
                      language === 'chinese-cn' ? 'zh-CN' : 'en-US';
      recognitionInstance.lang = langCode;

      recognitionInstance.onstart = () => {
        console.log('Speech recognition started');
      };

      recognitionInstance.onresult = (event: any) => {
        console.log('Speech recognition result:', event);
        console.log('isPausedRef.current:', isPausedRef.current);
        console.log('Current buffer:', speechBufferRef.current);
        
        const transcript = event.results[0][0].transcript;
        console.log('Transcript:', transcript);
        
        // If we're paused, add to buffer and don't send
        if (isPausedRef.current) {
          console.log('Paused - adding to buffer:', transcript);
          const newBuffer = speechBufferRef.current ? speechBufferRef.current + ' ' + transcript : transcript;
          speechBufferRef.current = newBuffer;
          setSpeechBuffer(newBuffer);
          console.log('Updated speech buffer:', newBuffer);
          return;
        }
        
        // Not paused - combine with buffer and send
        const finalTranscript = speechBufferRef.current ? speechBufferRef.current + ' ' + transcript : transcript;
        console.log('Final transcript to send:', finalTranscript);
        
        console.log('Socket and room check:', { socket: !!socket, inRoom, socketConnected: socket?.connected });
        if (socket && inRoom) {
          console.log('Emitting speech_transcription event with:', { transcription: finalTranscript.trim() });
          socket.emit('speech_transcription', { transcription: finalTranscript.trim() });
        } else {
          console.warn('Cannot emit transcription - socket or room not ready');
        }
        
        // Reset states and clear buffer
        setIsListening(false);
        setIsPaused(false);
        isPausedRef.current = false;
        speechBufferRef.current = '';
        setSpeechBuffer('');
      };

      recognitionInstance.onend = () => {
        console.log('Speech recognition ended');
        console.log('isPausedRef.current on end:', isPausedRef.current);
        // Only set isListening to false if we're not in a paused state
        if (!isPausedRef.current) {
          setIsListening(false);
        }
      };

      recognitionInstance.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        setIsPaused(false);
        isPausedRef.current = false;
        speechBufferRef.current = '';
        setSpeechBuffer('');
        
        let errorMessage = 'Speech recognition error occurred.';
        switch (event.error) {
          case 'audio-capture':
            errorMessage = isSafari() 
              ? 'No microphone found or access denied. Check Safari > Settings for This Website > Microphone.'
              : 'No microphone found or microphone access denied. Please check your microphone settings.';
            break;
          case 'not-allowed':
            errorMessage = isSafari()
              ? 'Microphone access denied. Go to Safari > Settings for This Website > Microphone and select "Allow".'
              : 'Microphone access denied. Please allow microphone access in your browser settings.';
            break;
          case 'network':
            errorMessage = 'Network error occurred during speech recognition.';
            break;
          case 'aborted':
            errorMessage = 'Speech recognition was aborted.';
            break;
          case 'no-speech':
            console.log('No speech detected - this is normal, try speaking again');
            // Don't show error for no-speech, just log it
            return;
          case 'bad-grammar':
            errorMessage = 'Speech recognition grammar error.';
            break;
          default:
            errorMessage = `Speech recognition error: ${event.error}`;
        }
        
        // Don't show alert for aborted or no-speech errors
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          alert(errorMessage);
        }
      };

      setRecognition(recognitionInstance);
    }
  }, [language, socket, inRoom]);

  // Check microphone permission on component mount
  useEffect(() => {
    const checkInitialPermission = async () => {
      await checkMicrophonePermission();
    };
    checkInitialPermission();
  }, []);

  // Fetch available voices on component mount
  useEffect(() => {
    const fetchVoices = async () => {
      try {
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}/api/voices`);
        if (response.ok) {
          const data = await response.json();
          setAvailableVoices(data.voices);
          setCartesiaAvailable(data.cartesia_available);
          console.log('🎵 TTS Configuration:', {
            cartesiaAvailable: data.cartesia_available,
            voices: data.voices,
            defaultVoice: data.cartesia_available ? 'Cartesia TTS' : 'Browser TTS'
          });
        }
      } catch (error) {
        console.error('Error fetching voices:', error);
        setCartesiaAvailable(false);
      }
    };
    
    fetchVoices();
  }, []);

  useEffect(() => {
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5050';
    const newSocket = io(apiUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
      setInRoom(false);
    });

    newSocket.on('room_joined', (data) => {
      setInRoom(true);
      setUsers(data.users || []);
    });

    newSocket.on('user_joined', (user) => {
      setUsers(prev => [...(prev || []), user]);
    });

    newSocket.on('user_left', (data) => {
      setUsers(prev => (prev || []).filter(u => u.id !== data.user_id));
    });

    newSocket.on('message_received', (message) => {
      setMessages(prev => [...prev, message]);
    });

    newSocket.on('transcription_received', (transcription) => {
      setTranscriptions(prev => [...prev, transcription]);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, transcriptions]);

  // Handle TTS for new translated messages
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.translated && ttsEnabled) {
        speakText(lastMessage.message, language);
      }
    }
  }, [messages, ttsEnabled, language]);

  // Handle TTS for new translated transcriptions
  useEffect(() => {
    if (transcriptions.length > 0) {
      const lastTranscription = transcriptions[transcriptions.length - 1];
      if (lastTranscription.translated && ttsEnabled) {
        speakText(lastTranscription.transcription, language);
      }
    }
  }, [transcriptions, ttsEnabled, language]);

  const joinRoom = () => {
    if (socket && username && roomId) {
      socket.emit('join_room', {
        room_id: roomId,
        username,
        language
      });
    }
  };

  const leaveRoom = () => {
    if (socket && roomId) {
      socket.emit('leave_room', { room_id: roomId });
      setInRoom(false);
      setUsers([]);
      setMessages([]);
      setTranscriptions([]);
    }
  };

  const sendMessage = () => {
    if (socket && currentMessage.trim()) {
      socket.emit('send_message', { message: currentMessage });
      setCurrentMessage('');
    }
  };

  const speakText = async (text: string, targetLanguage: string) => {
    if (!ttsEnabled || !text || text.trim() === '') return;
    
    try {
      // Map language codes for Cartesia (fallback to 'en' for unsupported languages)
      const langCode = targetLanguage.startsWith('english') ? 'en' :
                      targetLanguage === 'spanish' ? 'es' :
                      targetLanguage === 'french-fr' ? 'fr' :
                      targetLanguage === 'german' ? 'de' :
                      targetLanguage === 'japanese' ? 'ja' :
                      targetLanguage === 'hindi' ? 'hi' :
                      targetLanguage === 'chinese-cn' ? 'en' : 'en'; // Cartesia doesn't support Chinese, fallback to English
      
      if (cartesiaAvailable) {
        console.log('🎵 Using Cartesia TTS (default preference)');
        // Use Cartesia TTS via backend
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}/api/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: text.trim(),
            language: langCode,
            voice_profile: voiceProfile
          })
        });
        
        if (response.ok) {
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          
          // Store audio reference for pause/resume functionality
          setCurrentAudio(audio);
          setIsPlaying(true);
          
          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            setIsPlaying(false);
            setCurrentAudio(null);
          };
          
          audio.onerror = (e) => {
            console.error('Audio playback error:', e);
            URL.revokeObjectURL(audioUrl);
            setIsPlaying(false);
            setCurrentAudio(null);
          };
          
          audio.onpause = () => {
            setIsPlaying(false);
          };
          
          audio.onplay = () => {
            setIsPlaying(true);
          };
          
          try {
            await audio.play();
          } catch (playError) {
            console.warn('Audio autoplay blocked, user interaction required:', playError);
            setIsPlaying(false);
          }
        } else {
          console.error('TTS API error:', await response.text());
          console.log('🔄 Falling back to Browser TTS');
          // Fallback to browser TTS
          fallbackToWebSpeech(text, targetLanguage);
        }
      } else {
        console.log('⚠️ Cartesia not available - using Browser TTS fallback');
        // Use browser TTS as fallback
        fallbackToWebSpeech(text, targetLanguage);
      }
    } catch (error) {
      console.error('TTS error:', error);
      console.log('🔄 Error occurred - falling back to Browser TTS');
      // Fallback to browser TTS
      fallbackToWebSpeech(text, targetLanguage);
    }
  };
  
  const fallbackToWebSpeech = (text: string, targetLanguage: string) => {
    console.log('🔊 Using Browser TTS (Web Speech API)');
    if (!('speechSynthesis' in window) || !text || text.trim() === '') return;
    
    // Stop any current speech
    window.speechSynthesis.cancel();
    setIsPlaying(true);
    
    const utterance = new SpeechSynthesisUtterance(text.trim());
    
    // Set language for TTS
    const langCode = targetLanguage === 'english-us' ? 'en-US' :
                    targetLanguage === 'english-gb' ? 'en-GB' :
                    targetLanguage === 'english-in' ? 'en-IN' :
                    targetLanguage === 'spanish' ? 'es-ES' :
                    targetLanguage === 'french-fr' ? 'fr-FR' :
                    targetLanguage === 'german' ? 'de-DE' :
                    targetLanguage === 'japanese' ? 'ja-JP' :
                    targetLanguage === 'hindi' ? 'hi-IN' :
                    targetLanguage === 'chinese-cn' ? 'zh-CN' : 'en-US';
    utterance.lang = langCode;
    
    // Set voice properties
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 0.8;
    
    // Add event listeners for speech synthesis
    utterance.onend = () => {
      setIsPlaying(false);
    };
    
    utterance.onerror = () => {
      setIsPlaying(false);
    };
    
    window.speechSynthesis.speak(utterance);
  };

  const stopTTS = () => {
    // Stop Web Speech API
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    // Stop Cartesia audio if playing
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      setCurrentAudio(null);
    }
    
    setIsPlaying(false);
  };

  const pauseResumeTTS = () => {
    if ('speechSynthesis' in window) {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
      } else if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }
    
    if (currentAudio) {
      if (currentAudio.paused) {
        currentAudio.play();
      } else {
        currentAudio.pause();
      }
    }
  };

  const isSafari = () => {
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  };

  const checkMicrophonePermission = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMicrophonePermission('not-supported');
        return false;
      }

      // Safari doesn't fully support the Permissions API for microphone
      if (isSafari()) {
        try {
          // For Safari, we need to directly try to access the microphone
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioDevices = devices.filter(device => device.kind === 'audioinput');
          
          if (audioDevices.length === 0) {
            setMicrophonePermission('no-device');
            return false;
          }

          // Try to actually access the microphone in Safari
          const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
          stream.getTracks().forEach(track => track.stop());
          setMicrophonePermission('granted');
          return true;
        } catch (error: any) {
          console.error('Safari microphone access error:', error);
          if (error.name === 'NotAllowedError') {
            setMicrophonePermission('denied');
          } else if (error.name === 'NotFoundError') {
            setMicrophonePermission('no-device');
          } else {
            setMicrophonePermission('error');
          }
          return false;
        }
      } else {
        // For other browsers, use the Permissions API if available
        try {
          const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          setMicrophonePermission(permission.state);
          
          if (permission.state === 'granted') {
            return true;
          } else if (permission.state === 'denied') {
            return false;
          } else {
            // Try to request permission
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              stream.getTracks().forEach(track => track.stop());
              setMicrophonePermission('granted');
              return true;
            } catch (error) {
              setMicrophonePermission('denied');
              return false;
            }
          }
        } catch (permissionError) {
          // Fallback if Permissions API not supported
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            setMicrophonePermission('granted');
            return true;
          } catch (error) {
            setMicrophonePermission('denied');
            return false;
          }
        }
      }
    } catch (error) {
      console.error('Error checking microphone permission:', error);
      setMicrophonePermission('error');
      return false;
    }
  };

  // Meeting minutes functions
  const checkConversationStatus = async () => {
    if (!roomId) return;
    
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/conversation/${roomId}`);
      if (response.ok) {
        const status = await response.json();
        setConversationStatus(status);
      }
    } catch (error) {
      console.error('Error checking conversation status:', error);
    }
  };

  const generateMeetingMinutes = async () => {
    if (!roomId) return;
    
    setIsGeneratingMinutes(true);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      
      // Map user's language to backend language code
      const languageMapping: { [key: string]: string } = {
        'english-us': 'en',
        'english-gb': 'en',
        'english-in': 'en',
        'spanish': 'es',
        'french-fr': 'fr',
        'german': 'de',
        'japanese': 'ja',
        'hindi': 'hi',
        'chinese-cn': 'zh-CN'
      };
      
      const targetLang = languageMapping[language] || 'en';
      const response = await fetch(`${apiUrl}/api/minutes/${roomId}?language=${targetLang}`);
      const data = await response.json();
      
      if (data.error) {
        alert(`Error generating minutes: ${data.error}`);
      } else {
        setMeetingMinutes(data.minutes || '');
        setShowMinutes(true);
      }
    } catch (error) {
      console.error('Error generating minutes:', error);
      alert('Failed to generate meeting minutes');
    } finally {
      setIsGeneratingMinutes(false);
    }
  };

  // Check conversation status when room changes
  useEffect(() => {
    if (inRoom && roomId) {
      checkConversationStatus();
      // Check status every 30 seconds
      const interval = setInterval(checkConversationStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [inRoom, roomId]);

  const startListening = async () => {
    if (!recognition || isListening || !socket || !inRoom) {
      console.log('Cannot start listening:', { recognition: !!recognition, isListening, socket: !!socket, inRoom });
      return;
    }

    console.log('Starting speech recognition...');
    
    try {
      const hasPermission = await checkMicrophonePermission();
      if (!hasPermission) {
        let message = 'Microphone permission is required for voice input.';
        if (microphonePermission === 'denied') {
          if (isSafari()) {
            message += ' Please go to Safari > Settings for This Website > Microphone and select "Allow".';
          } else {
            message += ' Please go to your browser settings and allow microphone access for this site.';
          }
        } else if (microphonePermission === 'not-supported') {
          message = 'Your browser does not support microphone access.';
        } else if (microphonePermission === 'no-device') {
          message = 'No microphone device found. Please connect a microphone and try again.';
        }
        alert(message);
        return;
      }

      setIsListening(true);
      
      // Add a small delay to ensure permission is properly established
      setTimeout(() => {
        try {
          recognition.start();
          console.log('Speech recognition started successfully');
        } catch (startError) {
          console.error('Error starting recognition:', startError);
          setIsListening(false);
          alert('Failed to start voice recognition. Please try again.');
        }
      }, 100);
      
    } catch (error) {
      console.error('Error in startListening:', error);
      setIsListening(false);
      alert('Could not start voice recognition. Please check your microphone settings.');
    }
  };

  const pauseListening = () => {
    if (recognition && isListening && !isPaused) {
      console.log('Pausing speech recognition...');
      isPausedRef.current = true;
      setIsPaused(true);
      recognition.stop();
    }
  };

  const resumeListening = () => {
    if (recognition && isListening && isPaused) {
      console.log('Resuming speech recognition...');
      isPausedRef.current = false;
      setIsPaused(false);
      try {
        recognition.start();
        console.log('Speech recognition resumed');
      } catch (error) {
        console.error('Error resuming recognition:', error);
        setIsListening(false);
        setIsPaused(false);
        isPausedRef.current = false;
        speechBufferRef.current = '';
        setSpeechBuffer('');
      }
    }
  };

  const stopListening = () => {
    if (recognition && isListening) {
      console.log('Stopping speech recognition...');
      
      // Send any buffered speech before stopping
      if (speechBufferRef.current.trim() && socket && inRoom) {
        console.log('Sending buffered speech on stop:', speechBufferRef.current.trim());
        socket.emit('speech_transcription', { transcription: speechBufferRef.current.trim() });
      }
      
      recognition.stop();
      setIsListening(false);
      setIsPaused(false);
      isPausedRef.current = false;
      speechBufferRef.current = '';
      setSpeechBuffer('');
      console.log('Speech recognition stopped');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  if (!connected) {
    return (
      <div className="App">
        <div className="loading">Connecting to server...</div>
      </div>
    );
  }

  if (!inRoom) {
    return (
      <div className="App">
        <div className="join-form">
          <h1>Multilingual Chat & Speech</h1>
          <div className="form-group">
            <label>Username:</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
            />
          </div>
          <div className="form-group">
            <label>Language:</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Room ID:</label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter room ID"
            />
          </div>
          <button onClick={joinRoom} disabled={!username || !roomId}>
            Join Room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <div className="chat-header">
        <h2>Room: {roomId}</h2>
        <div className="user-info">
          {username} ({LANGUAGES.find(l => l.code === language)?.name})
        </div>
        <div className="header-controls">
          {cartesiaAvailable && (
            <div className="voice-control">
              <label htmlFor="voice-select">Voice:</label>
              <select 
                id="voice-select"
                value={voiceProfile} 
                onChange={(e) => setVoiceProfile(e.target.value)}
                className="voice-select"
              >
                {availableVoices.map(voice => (
                  <option key={voice} value={voice}>
                    {/* {voice === 'default' ? 'Default Voice' : voice === 'custom' ? 'Your Voice' : voice} */}
                    {voice === 'custom' ? 'Your Voice' : voice === 'default' ? 'Default Voice' : voice}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="tts-controls">
            <button 
              onClick={() => setTtsEnabled(!ttsEnabled)} 
              className={`tts-btn ${ttsEnabled ? 'enabled' : 'disabled'}`}
              title={ttsEnabled ? 'Disable text-to-speech' : 'Enable text-to-speech'}
            >
              {ttsEnabled ? '🔊' : '🔇'} {cartesiaAvailable ? 'Cartesia TTS' : 'TTS'}
            </button>
            {isPlaying && (
              <div className="tts-playback-controls">
                <button 
                  onClick={pauseResumeTTS}
                  className="tts-control-btn"
                  title="Pause/Resume TTS"
                >
                  {(currentAudio && !currentAudio.paused) || (window.speechSynthesis && window.speechSynthesis.speaking && !window.speechSynthesis.paused) ? '⏸️' : '▶️'}
                </button>
                <button 
                  onClick={stopTTS}
                  className="tts-control-btn"
                  title="Stop TTS"
                >
                  ⏹️
                </button>
              </div>
            )}
          </div>
          <button 
            onClick={generateMeetingMinutes}
            disabled={isGeneratingMinutes || !conversationStatus?.exists || !conversationStatus?.gemini_available}
            className="minutes-btn"
            title={!conversationStatus?.gemini_available ? 'Gemini AI not configured' : 'Generate meeting minutes with AI'}
          >
            {isGeneratingMinutes ? '⏳ Generating...' : '📝 Meeting Minutes'}
          </button>
          <button onClick={leaveRoom} className="leave-btn">Leave Room</button>
        </div>
      </div>
      
      <div className="main-content">
        <div className="sidebar">
          <h3>Users ({users?.length || 0})</h3>
          <div className="users-list">
            {(users || []).map(user => (
              <div key={user.id} className="user-item">
                <strong>{user.username}</strong>
                <span className="user-language">
                  {LANGUAGES.find(l => l.code === user.language)?.name}
                </span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="chat-area">
          <div className="messages-container">
            <div className="messages">
              {(() => {
                const allItems = [...(messages || []), ...(transcriptions || [])];
                console.log('Rendering messages and transcriptions:', { 
                  messages: messages?.length || 0, 
                  transcriptions: transcriptions?.length || 0, 
                  allItems: allItems.length,
                  transcriptionsData: transcriptions
                });
                return allItems;
              })().map((item, index) => (
                <div key={index} className={`message ${item.translated ? 'translated' : ''}`}>
                  <div className="message-header">
                    <strong>{item.username}</strong>
                    <span className="language-tag">
                      {LANGUAGES.find(l => l.code === item.original_language)?.name}
                      {item.translated && item.target_language && (
                        <> → {LANGUAGES.find(l => l.code === item.target_language)?.name}</>
                      )}
                    </span>
                    {'transcription' in item && <span className="speech-tag">🎤</span>}
                  </div>
                  
                  {item.translated && (('original_message' in item && item.original_message) || ('original_transcription' in item && item.original_transcription)) ? (
                    <div className="dual-language-content">
                      <div className="original-text">
                        <div className="text-label">
                          📝 {LANGUAGES.find(l => l.code === item.original_language)?.name}:
                        </div>
                        <div className="text-content">
                          {'message' in item 
                            ? (item.original_message || item.message) 
                            : (item.original_transcription || item.transcription)}
                        </div>
                      </div>
                      <div className="translated-text">
                        <div className="text-label">
                          🌐 {LANGUAGES.find(l => l.code === item.target_language)?.name}:
                        </div>
                        <div className="text-content">
                          {'message' in item 
                            ? (item.translated_message || item.message) 
                            : (item.translated_transcription || item.transcription)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="message-content">
                      {'message' in item ? item.message : item.transcription}
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
          
          <div className="input-area">
            <div className="speech-controls">
              {!isListening ? (
                <button 
                  onClick={startListening} 
                  disabled={!recognition || !socket || !inRoom}
                  className={`speech-btn ${microphonePermission === 'denied' ? 'permission-denied' : ''}`}
                  title={
                    microphonePermission === 'denied' 
                      ? isSafari() 
                        ? 'Microphone access denied. Go to Safari > Settings for This Website > Microphone and select "Allow".'
                        : 'Microphone access denied. Click to retry or check browser settings.'
                      : microphonePermission === 'not-supported'
                      ? 'Microphone not supported in this browser'
                      : microphonePermission === 'no-device'
                      ? 'No microphone device found. Please connect a microphone.'
                      : 'Click to start voice recognition'
                  }
                >
                  {microphonePermission === 'denied' ? '🎤❌ Mic Blocked' :
                   microphonePermission === 'not-supported' ? '🎤❌ Not Supported' :
                   microphonePermission === 'no-device' ? '🎤❌ No Device' :
                   '🎤 Speak'}
                </button>
              ) : (
                <div className="recording-controls">
                  <button 
                    onClick={isPaused ? resumeListening : pauseListening}
                    className="speech-control-btn"
                    title={isPaused ? 'Resume recording' : 'Pause recording'}
                  >
                    {isPaused ? '▶️' : '⏸️'}
                  </button>
                  <button 
                    onClick={stopListening}
                    className="speech-control-btn stop-btn"
                    title="Stop recording"
                  >
                    ⏹️
                  </button>
                  <span className="recording-status">
                    {isPaused ? '🎤 Paused' : '🎤 Listening...'}
                  </span>
                </div>
              )}
              {microphonePermission === 'denied' && (
                <div className="permission-hint">
                  ⚠️ {isSafari() ? 'Safari > Settings for This Website > Microphone > Allow' : 'Allow microphone access in browser settings'}
                </div>
              )}
              {microphonePermission === 'no-device' && (
                <div className="permission-hint">
                  ⚠️ Connect a microphone device
                </div>
              )}
            </div>
            <div className="text-input">
              <input
                type="text"
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                className="message-input"
              />
              <button onClick={sendMessage} className="send-btn">Send</button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Meeting Minutes Modal */}
      {showMinutes && (
        <div className="minutes-modal-overlay" onClick={() => setShowMinutes(false)}>
          <div className="minutes-modal" onClick={(e) => e.stopPropagation()}>
            <div className="minutes-header">
              <h3>Meeting Minutes</h3>
              <button onClick={() => setShowMinutes(false)} className="close-btn">×</button>
            </div>
            <div className="minutes-content">
              {meetingMinutes ? (
                <div className="minutes-text">
                  {meetingMinutes.split('\n').map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
                </div>
              ) : (
                <p>No minutes available</p>
              )}
            </div>
            <div className="minutes-footer">
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(meetingMinutes);
                  alert('Minutes copied to clipboard!');
                }}
                className="copy-btn"
              >
                📋 Copy to Clipboard
              </button>
              <button onClick={() => setShowMinutes(false)} className="close-btn">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export default App;
