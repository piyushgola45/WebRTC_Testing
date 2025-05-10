import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const socket = io('https://webrtc-backend-q4qz.onrender.com');

function App() {
  const [userType] = useState(localStorage.getItem('userType') || 'patient'); // Set this based on login
  const [appointmentId, setAppointmentId] = useState(null);
  const [meetingStatus, setMeetingStatus] = useState('not-started');
  // ... (keep other state variables)

  const joinMeeting = () => {
    // In a real app, get this from your appointment system
    const generatedAppointmentId = `appt-${Date.now()}`; 
    setAppointmentId(generatedAppointmentId);
    socket.emit('join-appointment', generatedAppointmentId, userType, userId);
    setMeetingStatus('waiting');
  };

  useEffect(() => {
    socket.on('meeting-started', () => {
      setMeetingStatus('active');
      // Start the video call automatically
      if (remoteUserId) {
        startCall(remoteUserId);
      }
    });

    socket.on('appointment-info', (data) => {
      if (data.status === 'active') {
        setMeetingStatus('active');
        const otherUserType = userType === 'patient' ? 'doctor' : 'patient';
        if (data.participants[otherUserType]) {
          setRemoteUserId(data.participants[otherUserType].userId);
        }
      }
    });

    return () => {
      socket.off('meeting-started');
      socket.off('appointment-info');
    };
  }, [userType]);

  return (
    <div>
      {/* Simplified UI */}
      {meetingStatus === 'not-started' && (
        <button onClick={joinMeeting}>
          Join Meeting
        </button>
      )}

      {meetingStatus === 'waiting' && (
        <div>Waiting for {userType === 'patient' ? 'doctor' : 'patient'} to join...</div>
      )}

      {meetingStatus === 'active' && (
        <>
          {/* Video call UI */}
          <div className="video-container">
            <video ref={localVideoRef} autoPlay muted playsInline />
            <video ref={remoteVideoRef} autoPlay playsInline />
          </div>
          
          {/* Chat UI */}
          <div className="chat-container">
            {/* ... your existing chat UI ... */}
          </div>
        </>
      )}
    </div>
  );
}

export default App;