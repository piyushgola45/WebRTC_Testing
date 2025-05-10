import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

// const socket = io('https://webrtc-backend-q4qz.onrender.com');
const socket = io('http://localhost:5000');
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

  // Initialize user ID on component mount

  useEffect(() => {
    const id = Math.random().toString(36).substring(2, 9);
    setUserId(id);
    socket.emit('join', id);

    // Clean up on unmount
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      socket.disconnect();
    };
  }, []);

  // Initialize peer connection
  const initPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // You may want to add your own TURN server here for production
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', {
          target: remoteUserId,
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

  // Start a call
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
      sender: userId
    };

    socket.emit('message', messageData);
    setMessages(prev => [...prev, {
      sender: userId,
      text: newMessage,
      timestamp: new Date().toISOString(),
      isLocal: true
    }]);
    setNewMessage('');
  };

  useEffect(() => {
    const handleMessage = (data) => {
      setMessages(prev => [...prev, {
        sender: data.sender,
        text: data.text,
        timestamp: data.timestamp,
        isLocal: false
      }]);
    };

    socket.on('message', handleMessage);

    return () => {
      socket.off('message', handleMessage);
    };
  }, []);

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
        <p><strong>Your ID:</strong> {userId}</p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Enter remote user ID"
            value={remoteUserId}
            onChange={(e) => setRemoteUserId(e.target.value)}
            disabled={callStatus !== 'disconnected'}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid #ccc'
            }}
          />
          <button
            onClick={startCall}
            disabled={callStatus !== 'disconnected' || !remoteUserId}
            style={{
              padding: '10px 16px',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Call
          </button>
          <button
            onClick={endCall}
            disabled={callStatus === 'disconnected'}
            style={{
              padding: '10px 16px',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            End
          </button>
        </div>
        <p style={{ marginTop: '10px' }}><strong>Status:</strong> {callStatus}</p>
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
    <button onClick={()=>{
      console.log(userId);
    }}>click</button>
  </div>
);


}

export default App;