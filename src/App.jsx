import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import "../styles/app.css";
const socket = io('https://webrtc-backend-q4qz.onrender.com');
// const socket = io('http://localhost:5000');

function App() {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  const [userId, setUserId] = useState('');
  const [remoteUserId, setRemoteUserId] = useState('');
  const [callStatus, setCallStatus] = useState('disconnected');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);

  useEffect(() => {
    const id = Math.random().toString(36).substring(2, 9);
    setUserId(id);
    socket.emit('join', id);

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      socket.disconnect();
    };
  }, []);

  const initPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', {
          target: remoteUserId,
          signal: {
            type: 'candidate',
            candidate: event.candidate,
          },
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pcRef.current = pc;
  };

  const startLocalVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      localVideoRef.current.srcObject = stream;

      if (pcRef.current) {
        stream.getTracks().forEach(track => {
          pcRef.current.addTrack(track, stream);
        });
      }
    } catch (err) {
      console.error('Error accessing media devices:', err);
    }
  };

  useEffect(() => {
    socket.on('signal', async (data) => {
      if (data.sender !== remoteUserId) return;

      try {
        const pc = pcRef.current;
        if (!pc) return;

        if (data.signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit('signal', {
            target: remoteUserId,
            signal: answer,
          });
          setCallStatus('connected');
        } else if (data.signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
          setCallStatus('connected');
        } else if (data.signal.type === 'candidate') {
          await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
        }
      } catch (err) {
        console.error('Error handling signal:', err);
      }
    });

    socket.on('user-disconnected', (disconnectedUserId) => {
      if (disconnectedUserId === remoteUserId) {
        setCallStatus('disconnected');
        setRemoteUserId('');
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
      }
    });
  }, [remoteUserId]);

  const startCall = async () => {
    if (!remoteUserId) {
      alert('Please enter a remote user ID');
      return;
    }

    setCallStatus('calling');
    initPeerConnection();
    await startLocalVideo();

    try {
      const pc = pcRef.current;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('signal', {
        target: remoteUserId,
        signal: offer,
      });
    } catch (err) {
      console.error('Error starting call:', err);
      setCallStatus('disconnected');
    }
  };

  const endCall = () => {
    setCallStatus('disconnected');
    setRemoteUserId('');

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  const sendMessage = () => {
    if (!newMessage.trim() || !remoteUserId) return;

    const messageData = {
      text: newMessage,
      target: remoteUserId,
      sender: userId,
    };

    socket.emit('message', messageData);
    setMessages(prev => [...prev, {
      sender: userId,
      text: newMessage,
      timestamp: new Date().toISOString(),
      isLocal: true,
    }]);
    setNewMessage('');
  };

  useEffect(() => {
    const handleMessage = (data) => {
      setMessages(prev => [...prev, {
        sender: data.sender,
        text: data.text,
        timestamp: data.timestamp,
        isLocal: false,
      }]);
    };

    socket.on('message', handleMessage);

    return () => {
      socket.off('message', handleMessage);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const renderMessage = (msg, index) => (
    <div key={index} className={`message ${msg.isLocal ? 'local' : 'remote'}`}>
      <div className="message-bubble">
        {msg.text}
        <div className="timestamp">
          {new Date(msg.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );

  return (
    <div className="app">
      <div className="container">
        <h1>WebRTC Video Chat</h1>
        <div className="user-id">
          <p><strong>Your ID:</strong> {userId}</p>
        </div>
        
        <div className="input-container">
          <input
            type="text"
            placeholder="Enter remote user ID"
            value={remoteUserId}
            onChange={(e) => setRemoteUserId(e.target.value)}
            disabled={callStatus !== 'disconnected'}
          />
          <button
            onClick={startCall}
            disabled={callStatus !== 'disconnected' || !remoteUserId}
          >
            Call
          </button>
          <button
            onClick={endCall}
            disabled={callStatus === 'disconnected'}
          >
            End
          </button>
        </div>

        <p>Status: {callStatus}</p>

        <div className="video-container">
          <div className="video-box">
            <h3>Local Video</h3>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
            />
          </div>
          <div className="video-box">
            <h3>Remote Video</h3>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
            />
          </div>
        </div>

        <div className="chat-box">
          <div className="messages">
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </div>
          <div className="message-input">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message..."
              disabled={callStatus === 'disconnected'}
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim() || callStatus === 'disconnected'}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
