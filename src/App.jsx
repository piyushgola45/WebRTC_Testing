import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const socket = io('https://your-vercel-url.vercel.app'); // Replace with your Vercel URL
const peer = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
});

export default function App() {
  const localRef = useRef();
  const remoteRef = useRef();
  const [myID, setMyID] = useState('');
  const [otherUserID, setOtherUserID] = useState('');

  useEffect(() => {
    // Get media from user
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localRef.current.srcObject = stream;
        stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      });

    // Peer connection handlers
    peer.ontrack = (event) => {
      remoteRef.current.srcObject = event.streams[0];
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('candidate', {
          target: otherUserID,
          candidate: event.candidate,
        });
      }
    };

    // Join room
    const roomID = 'room1'; // Hardcoded room ID for simplicity
    socket.emit('join-room', roomID);

    // When another user joins
    socket.on('user-joined', (userID) => {
      setOtherUserID(userID);
      if (peer.signalingState === 'stable') {
        peer.createOffer().then((offer) => {
          peer.setLocalDescription(offer);
          socket.emit('offer', { sdp: offer, target: userID });
        });
      }
    });

    // Receive offer from other user
    socket.on('offer', async ({ sdp, caller }) => {
      setOtherUserID(caller);
      await peer.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit('answer', { sdp: answer, target: caller });
    });

    // Receive answer from other user
    socket.on('answer', async ({ sdp }) => {
      await peer.setRemoteDescription(new RTCSessionDescription(sdp));
    });

    // Receive ICE candidate
    socket.on('candidate', async (candidate) => {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding ICE candidate', err);
      }
    });

    socket.on('room-full', () => {
      alert('Room is full!');
    });
  }, [otherUserID]);

  return (
    <div>
      <h2>React WebRTC Video Call (Room)</h2>
      <video ref={localRef} autoPlay muted playsInline width={300} />
      <video ref={remoteRef} autoPlay playsInline width={300} />
    </div>
  );
}
