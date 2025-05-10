import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const socket = io('https://webrtc-backend-q4qz.onrender.com');

function App() {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [userId] = useState(Math.random().toString(36).substring(2, 9));
  const [roomId, setRoomId] = useState('');
  const [joined, setJoined] = useState(false);
  const [callStatus, setCallStatus] = useState('disconnected');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [remoteUserId, setRemoteUserId] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [pendingCandidates, setPendingCandidates] = useState([]);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const messagesEndRef = useRef(null);

  const initPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && remoteUserId) {
        socket.emit('signal', {
          targetUserId: remoteUserId,
          signal: {
            type: 'candidate',
            candidate: event.candidate,
          },
        });
      } else if (event.candidate) {
        setPendingCandidates((prev) => [...prev, event.candidate]);
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
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);
    localVideoRef.current.srcObject = stream;

    stream.getTracks().forEach((track) => {
      pcRef.current?.addTrack(track, stream);
    });
  };

  const startCall = async (targetUserId) => {
    if (callStatus !== 'waiting') return;

    setRemoteUserId(targetUserId);
    setCallStatus('connecting');
    initPeerConnection();
    await startLocalVideo();

    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);

    socket.emit('signal', {
      targetUserId,
      signal: offer,
    });
  };

  const handleSignal = async ({ signal, senderId }) => {
    if (!pcRef.current) initPeerConnection();

    if (signal.type === 'offer') {
      await startLocalVideo();
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      socket.emit('signal', {
        targetUserId: senderId,
        signal: answer,
      });
      setCallStatus('connected');
    } else if (signal.type === 'answer') {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
      setCallStatus('connected');
    } else if (signal.type === 'candidate') {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    }
  };

  const joinRoom = () => {
    if (!roomId) return;
    socket.emit('join-room', roomId, userId);
    setCallStatus('waiting');
    setJoined(true);
  };

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

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
  };

  const sendMessage = () => {
    if (!newMessage.trim()) return;

    socket.emit('message', newMessage);
    setMessages((prev) => [
      ...prev,
      { senderId: userId, text: newMessage, timestamp: new Date().toISOString(), isLocal: true },
    ]);
    setNewMessage('');
  };

  useEffect(() => {
    socket.on('signal', handleSignal);

    socket.on('user-joined', (joinedUserId) => {
      if (joinedUserId !== userId) {
        setParticipants((prev) => [...prev, joinedUserId]);
        if (callStatus === 'waiting') startCall(joinedUserId);
      }
    });

    socket.on('user-left', (leftUserId) => {
      if (leftUserId === remoteUserId) endCall();
      setParticipants((prev) => prev.filter((id) => id !== leftUserId));
    });

    socket.on('room-info', ({ participants, messages }) => {
      setParticipants(participants);
      setMessages(
        messages.map((msg) => ({
          ...msg,
          isLocal: msg.senderId === userId,
        }))
      );

      const otherUsers = participants.filter((id) => id !== userId);
      if (otherUsers.length > 0 && callStatus === 'waiting') {
        startCall(otherUsers[0]);
      }
    });

    socket.on('message', (message) => {
      setMessages((prev) => [
        ...prev,
        { ...message, isLocal: message.senderId === userId },
      ]);
    });

    return () => {
      socket.off('signal');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('room-info');
      socket.off('message');
    };
  }, [userId, callStatus, remoteUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div style={{ fontFamily: 'Arial', background: '#f4f6f9', minHeight: '100vh', padding: '20px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', background: '#fff', borderRadius: '12px', padding: '30px' }}>
        <h1 style={{ textAlign: 'center' }}>WebRTC Video Chat</h1>

        <div style={{ marginBottom: '20px' }}>
          <input
            type="text"
            placeholder="Enter Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            style={{ padding: '10px', width: '70%', marginRight: '10px', borderRadius: '6px' }}
            disabled={joined}
          />
          <button
            onClick={joinRoom}
            disabled={joined || !roomId}
            style={{ padding: '10px 20px', borderRadius: '6px', background: '#007bff', color: 'white' }}
          >
            Join Room
          </button>
          {joined && (
            <button
              onClick={endCall}
              style={{ padding: '10px 20px', borderRadius: '6px', marginLeft: '10px', background: '#dc3545', color: 'white' }}
            >
              End Call
            </button>
          )}
          <p style={{ marginTop: '10px' }}>
            <strong>Status:</strong> {callStatus} | <strong>Participants:</strong> {participants.length}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '30px' }}>
          <div>
            <h3>Local Video</h3>
            <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '320px', height: '240px', background: '#ddd', borderRadius: '10px' }} />
          </div>
          <div>
            <h3>Remote Video</h3>
            <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '320px', height: '240px', background: '#ddd', borderRadius: '10px' }} />
          </div>
        </div>

        <div style={{ border: '1px solid #ddd', borderRadius: '10px', padding: '10px', height: '250px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '10px' }}>
            {messages.map((msg, index) => (
              <div key={index} style={{ textAlign: msg.isLocal ? 'right' : 'left', margin: '5px 0' }}>
                <div style={{
                  display: 'inline-block',
                  padding: '8px 12px',
                  borderRadius: '12px',
                  background: msg.isLocal ? '#007bff' : '#e9ecef',
                  color: msg.isLocal ? 'white' : 'black',
                  maxWidth: '70%',
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
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message..."
              disabled={callStatus === 'disconnected'}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim() || callStatus === 'disconnected'}
              style={{ padding: '10px 16px', background: '#007bff', color: 'white', border: 'none', borderRadius: '8px' }}
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
