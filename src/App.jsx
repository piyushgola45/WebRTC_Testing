import React, { useState, useRef, useEffect } from "react";
import io from "socket.io-client";

// Connect to the signaling server
const socket = io("http://localhost:5000");

const App = () => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callStatus, setCallStatus] = useState("disconnected");
  const [remoteUserId, setRemoteUserId] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  // Initialize peer connection
  const initPeerConnection = () => {
    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", {
          targetUserId: remoteUserId,
          signal: {
            type: "candidate",
            candidate: event.candidate,
          },
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      }
    };
  };

  // Start local video
  const startLocalVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      stream.getTracks().forEach((track) => {
        pcRef.current?.addTrack(track, stream);
      });
    } catch (err) {
      console.error("Error accessing media devices.", err);
    }
  };

  // Handle signaling messages (offer, answer, candidate)
  const handleSignal = async ({ signal, senderId }) => {
    if (!pcRef.current) initPeerConnection();

    if (signal.type === "offer") {
      setRemoteUserId(senderId);
      await startLocalVideo();
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      socket.emit("signal", {
        targetUserId: senderId,
        signal: answer,
      });
      setCallStatus("connected");
    } else if (signal.type === "answer") {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
      setCallStatus("connected");
    } else if (signal.type === "candidate") {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch (err) {
        console.error("Error adding ICE candidate:", err);
      }
    }
  };

  // Listen for incoming signaling messages
  useEffect(() => {
    socket.on("signal", handleSignal);

    return () => {
      socket.off("signal", handleSignal);
    };
  }, []);

  // Handle the "Start Call" button click
  const startCall = () => {
    socket.emit("signal", { type: "start" });
    setCallStatus("calling");
  };

  // Handle the "End Call" button click
  const endCall = () => {
    setCallStatus("disconnected");
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    if (pcRef.current) {
      pcRef.current.close();
    }
    setLocalStream(null);
    setRemoteStream(null);
  };

  return (
    <div>
      <h1>WebRTC Video Chat</h1>

      {/* Local Video */}
      <video ref={localVideoRef} autoPlay muted style={{ width: "300px" }}></video>

      {/* Remote Video */}
      <video ref={remoteVideoRef} autoPlay style={{ width: "300px" }}></video>

      <div>
        {callStatus === "disconnected" && (
          <button onClick={startCall}>Start Call</button>
        )}

        {callStatus === "calling" && <p>Calling...</p>}

        {callStatus === "connected" && (
          <button onClick={endCall}>End Call</button>
        )}
      </div>
    </div>
  );
};

export default App;
