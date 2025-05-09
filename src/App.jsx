// App.jsx
import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const socket = io('https://webrtc-backend-q4qz.onrender.com'); // replace with your backend URL

const peer = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
});

export default function App() {
  const localRef = useRef(null);
  const remoteRef = useRef(null);
  const [roomID] = useState('room1'); // can make this dynamic
  const [otherUser, setOtherUser] = useState(null);

  useEffect(() => {
    let localStream;

    const init = async () => {
      // Get media
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localRef.current.srcObject = localStream;
      localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

      // Join room
      socket.emit('join-room', roomID);
    };

    init();

    // ICE candidate
    peer.onicecandidate = e => {
      if (e.candidate && otherUser) {
        socket.emit('candidate', { target: otherUser, candidate: e.candidate });
      }
    };

    // On track
    peer.ontrack = e => {
      if (remoteRef.current) {
        remoteRef.current.srcObject = e.streams[0];
      }
    };

    // When another user joins
    socket.on('user-joined', async userID => {
      setOtherUser(userID);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit('offer', { target: userID, sdp: offer });
    });

    // Receive offer
    socket.on('offer', async ({ sdp, caller }) => {
      setOtherUser(caller);
      await peer.setRemoteDescription(new RTCSessionDescription(sdp));

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit('answer', { target: caller, sdp: answer });
    });

    // Receive answer
    socket.on('answer', async ({ sdp }) => {
      await peer.setRemoteDescription(new RTCSessionDescription(sdp));
    });

    // Receive ICE
    socket.on('candidate', async candidate => {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    });

    socket.on('room-full', () => alert('Room is full'));

    return () => {
      socket.disconnect();
      peer.close();
      if (localStream) localStream.getTracks().forEach(track => track.stop());
    };
  }, [roomID, otherUser]);

  return (
    <div>
      <h1>WebRTC Video Chat</h1>
      <video ref={localRef} autoPlay muted playsInline width="300" />
      <video ref={remoteRef} autoPlay playsInline width="300" />
    </div>
  );
}
