import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const socket = io('https://webrtc-backend-q4qz.onrender.com');

function App() {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  const [userId] = useState(Math.random().toString(36).substring(2, 9));
  const [roomId, setRoomId] = useState('');
  const [callStatus, setCallStatus] = useState('disconnected');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [remoteUserId, setRemoteUserId] = useState(null);
  const [participants, setParticipants] = useState([]);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);

  // Generate a random room ID when component mounts
  useEffect(() => {
    const generatedRoomId = Math.random().toString(36).substring(2, 8);
    setRoomId(generatedRoomId);
  }, []);

  // Join room when roomId is set
  useEffect(() => {
    if (roomId) {
      socket.emit('join-room', roomId, userId);
      setCallStatus('waiting');
    }

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (pcRef.current) {
        pcRef.current.close();
      }
    };
  }, [roomId, userId]);

  // Initialize peer connection
  const initPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && remoteUserId) {
        socket.emit('signal', {
          targetUserId: remoteUserId,
          signal: {
            type: 'candidate',
            candidate: event.candidate
          }
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

  // Start local video
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

  // Handle incoming signals
  useEffect(() => {
    const handleSignal = async (data) => {
      try {
        const pc = pcRef.current;
        if (!pc) return;

        if (data.signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          socket.emit('signal', {
            targetUserId: data.senderId,
            signal: answer
          });
          setCallStatus('connected');
        } 
        else if (data.signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
          setCallStatus('connected');
        } 
        else if (data.signal.type === 'candidate') {
          await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
        }
      } catch (err) {
        console.error('Error handling signal:', err);
      }
    };

    socket.on('signal', handleSignal);
    return () => socket.off('signal', handleSignal);
  }, []);

  // Handle room events
  useEffect(() => {
    socket.on('user-joined', (joinedUserId) => {
      if (joinedUserId !== userId) {
        setRemoteUserId(joinedUserId);
        setParticipants(prev => [...prev, joinedUserId]);
        
        if (callStatus === 'waiting') {
          startCall(joinedUserId);
        }
      }
    });

    socket.on('user-left', (leftUserId) => {
      if (leftUserId === remoteUserId) {
        setCallStatus('disconnected');
        setRemoteUserId(null);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
      }
      setParticipants(prev => prev.filter(id => id !== leftUserId));
    });

    socket.on('room-info', ({ participants, messages }) => {
      setParticipants(participants);
      setMessages(messages.map(msg => ({
        ...msg,
        isLocal: msg.senderId === userId
      })));
      
      if (participants.length > 0 && callStatus === 'waiting') {
        setRemoteUserId(participants[0]);
        startCall(participants[0]);
      }
    });

    socket.on('message', (message) => {
      setMessages(prev => [...prev, {
        ...message,
        isLocal: message.senderId === userId
      }]);
    });

    return () => {
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('room-info');
      socket.off('message');
    };
  }, [userId, callStatus, remoteUserId]);

  // Start a call with specific user
  const startCall = async (targetUserId) => {
    setCallStatus('connecting');
    initPeerConnection();
    await startLocalVideo();

    try {
      const pc = pcRef.current;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('signal', {
        targetUserId: targetUserId,
        signal: offer
      });
    } catch (err) {
      console.error('Error starting call:', err);
      setCallStatus('disconnected');
    }
  };

  // End the call
  const endCall = () => {
    setCallStatus('disconnected');
    setRemoteUserId(null);
    
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  const sendMessage = () => {
    if (!newMessage.trim()) return;

    socket.emit('message', newMessage);
    setMessages(prev => [...prev, {
      senderId: userId,
      text: newMessage,
      timestamp: new Date().toISOString(),
      isLocal: true
    }]);
    setNewMessage('');
  };

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Render individual message component
  const renderMessage = (msg, index) => (
    <div key={index} style={{
      textAlign: msg.isLocal ? 'right' : 'left',
      margin: '5px 0'
    }}>
      <div style={{
        display: 'inline-block',
        padding: '8px 12px',
        borderRadius: '12px',
        background: msg.isLocal ? '#007bff' : '#e9ecef',
        color: msg.isLocal ? 'white' : 'black',
        maxWidth: '70%'
      }}>
        {msg.text}
        <div style={{
          fontSize: '0.7em',
          marginTop: '4px',
          color: msg.isLocal ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)'
        }}>
          {new Date(msg.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{
      fontFamily: 'Arial, sans-serif',
      background: '#f4f6f9',
      minHeight: '100vh',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '900px',
        margin: '0 auto',
        background: '#fff',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        padding: '30px'
      }}>
        <h1 style={{ textAlign: 'center', marginBottom: '20px' }}>WebRTC Video Chat</h1>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ 
            padding: '15px', 
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            marginBottom: '15px'
          }}>
            <p style={{ fontWeight: 'bold', marginBottom: '5px' }}>Room ID:</p>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #ccc',
                  marginRight: '10px',
                  fontWeight: 'bold',
                  textAlign: 'center'
                }}
                readOnly
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomId);
                  alert('Room ID copied to clipboard!');
                }}
                style={{
                  padding: '10px',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Copy
              </button>
            </div>
            <p style={{ marginTop: '10px', fontSize: '0.9em', color: '#6c757d' }}>
              Share this ID with the other participant
            </p>
          </div>

          <p style={{ marginTop: '10px' }}>
            <strong>Status:</strong> {callStatus}
            {participants.length > 0 && ` | Participants: ${participants.length}`}
          </p>
        </div>

        <div style={{
          display: 'flex',
          gap: '20px',
          justifyContent: 'center',
          marginBottom: '30px'
        }}>
          <div style={{ textAlign: 'center' }}>
            <h3>Local Video</h3>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '320px', height: '240px', borderRadius: '10px', background: '#ddd' }}
            />
          </div>
          <div style={{ textAlign: 'center' }}>
            <h3>Remote Video</h3>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{ width: '320px', height: '240px', borderRadius: '10px', background: '#ddd' }}
            />
          </div>
        </div>

        <div style={{
          border: '1px solid #ddd',
          borderRadius: '10px',
          padding: '10px',
          background: '#fafafa',
          height: '250px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '10px' }}>
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message..."
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #ccc'
              }}
              disabled={callStatus === 'disconnected'}
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim() || callStatus === 'disconnected'}
              style={{
                padding: '10px 16px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
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