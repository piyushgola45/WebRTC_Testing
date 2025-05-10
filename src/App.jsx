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
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: 'turn:turn.example.com:3478',
          username: 'user',
          credential: 'pass',
        },
      ],
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

    initPeerConnection();
    await startLocalVideo();

    setRemoteUserId(targetUserId);
    setCallStatus('connecting');

    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);

    socket.emit('signal', {
      targetUserId,
      signal: offer,
    });

    pendingCandidates.forEach(candidate => {
      socket.emit('signal', {
        targetUserId,
        signal: {
          type: 'candidate',
          candidate,
        },
      });
    });

    setPendingCandidates([]);
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

    socket.on('user-joined', (userId) => {
      setParticipants((prev) => [...prev, userId]);
    });

    socket.on('user-left', (userId) => {
      setParticipants((prev) => prev.filter((id) => id !== userId));
    });

    socket.on('message', (message) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on('room-info', ({ participants, messages }) => {
      setParticipants(participants);
      setMessages(messages);
    });

    return () => {
      socket.off('signal', handleSignal);
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('message');
      socket.off('room-info');
    };
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div>
      {!joined ? (
        <div>
          <input
            type="text"
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button onClick={joinRoom}>Join Room</button>
        </div>
      ) : (
        <div>
          <div>
            <h3>Participants</h3>
            <ul>
              {participants.map((participant) => (
                <li key={participant}>{participant}</li>
              ))}
            </ul>
          </div>

          <div>
            <video ref={localVideoRef} autoPlay muted></video>
            <video ref={remoteVideoRef} autoPlay></video>
          </div>

          <div>
            <button onClick={() => startCall(participants[0])}>Start Call</button>
            <button onClick={endCall}>End Call</button>
          </div>

          <div>
            <div>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message"
              ></textarea>
              <button onClick={sendMessage}>Send</button>
            </div>
            <div>
              <ul>
                {messages.map((msg, index) => (
                  <li key={index}>
                    {msg.senderId}: {msg.text}
                  </li>
                ))}
                <div ref={messagesEndRef}></div>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
