import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const socket = io('http://localhost:5000');

function App() {
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

  return (
    <div className="App" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>WebRTC Video Call</h1>
      <div>
        <p>Your ID: <strong>{userId}</strong></p>
        <div>
          <label htmlFor="remoteUserId">Call to: </label>
          <input
            id="remoteUserId"
            type="text"
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
            End Call
          </button>
        </div>
        <p>Status: {callStatus}</p>
      </div>

      <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
        <div>
          <h3>Local Video</h3>
          <video 
            ref={localVideoRef} 
            autoPlay 
            muted 
            playsInline
            style={{ width: '300px', height: '225px', backgroundColor: '#eee' }}
          />
        </div>
        <div>
          <h3>Remote Video</h3>
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline
            style={{ width: '300px', height: '225px', backgroundColor: '#eee' }}
          />
        </div>
      </div>
    </div>
  );
}

export default App;