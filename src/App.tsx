import {
  LocalUser,
  RemoteUser,
  useIsConnected,
  useJoin,
  useLocalMicrophoneTrack,
  useLocalCameraTrack,
  usePublish,
  useRemoteUsers,
} from "agora-rtc-react";
import { useState, useEffect } from "react";
import AgoraRTC, { AgoraRTCProvider, type IAgoraRTCClient, type ILocalVideoTrack } from "agora-rtc-react";
import "./App.css";

export const VideoCalling = () => {
  const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  return(
        <AgoraRTCProvider client={client}>
          <Basics />
        </AgoraRTCProvider>
  );
}

const Basics = () => {
  const [calling, setCalling] = useState(false);
  const isConnected = useIsConnected();
  const [appId, setAppId] = useState("4703d12de1af47eb94294a750641a314");
  const [channel, setChannel] = useState("Unity_Channel");
  const [token, setToken] = useState("007eJxTYGhf47Qixj7D0ffVcWWVi+Vn3kjs+CdisuhVnvt25eXBca8UGEzMDYxTDI1SUg0T00zMU5MsTYwsTRLNTQ3MTAwTjQ1NrN+XZzQEMjJ01iUyMzJAIIjPyxCal1lSGe+ckZiXl5rDwAAAhzoi2Q==");
  const [micOn, setMic] = useState(true);
  const [cameraOn, setCamera] = useState(true);
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micOn);
  const { localCameraTrack } = useLocalCameraTrack(cameraOn);
  
  // Screen sharing state
  const [screenShareOn, setScreenShare] = useState(false);
  const [screenClient, setScreenClient] = useState<IAgoraRTCClient | null>(null);
  const [screenTrack, setScreenTrack] = useState<ILocalVideoTrack | null>(null);

  useJoin({appid: appId, channel: channel, token: token ? token : null}, calling);
  usePublish([localMicrophoneTrack, localCameraTrack]);

  const remoteUsers = useRemoteUsers();

  // Screen sharing functions
  const startScreenShare = async () => {
    try {
      const newScreenClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      
      await newScreenClient.join(appId, channel, token || null);
      
      const screenTrackResult = await AgoraRTC.createScreenVideoTrack({});
      let screenVideoTrack: ILocalVideoTrack;
      if (Array.isArray(screenTrackResult)) {
        screenVideoTrack = screenTrackResult[0]; 
        await newScreenClient.publish(screenTrackResult);
      } else {
        screenVideoTrack = screenTrackResult;
        await newScreenClient.publish(screenVideoTrack);
      }
      
      setScreenClient(newScreenClient);
      setScreenTrack(screenVideoTrack);
      setScreenShare(true);
      
    } catch (error) {
      console.error("Error starting screen share:", error);
      setScreenShare(false);
    }
  };

  const stopScreenShare = async () => {
    try {
      if (screenTrack) {
        screenTrack.close();
        setScreenTrack(null);
      }
      
      if (screenClient) {
        await screenClient.leave();
        setScreenClient(null);
      }
      
      setScreenShare(false);
    } catch (error) {
      console.error("Error stopping screen share:", error);
    }
  };

  const handleScreenShare = () => {
    if (screenShareOn) {
      stopScreenShare();
    } else {
      startScreenShare();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (screenShareOn) {
        stopScreenShare();
      }
    };
  }, []);

  useEffect(() => {
    if (!calling && screenShareOn) {
      stopScreenShare();
    }
  }, [calling, screenShareOn]);

  return (
    <div className="video-calling-container">
      {isConnected ? (
        <div className="video-call-area">
          <div className="video-grid">
            <div className="local-user-container">
              <LocalUser
                audioTrack={localMicrophoneTrack}
                cameraOn={cameraOn}
                micOn={micOn}
                playAudio={false}
                videoTrack={localCameraTrack}
                className="video-frame"
              >
                <div className="user-label">You</div>
              </LocalUser>
            </div>
            
            {remoteUsers.map((user) => (
              <div key={user.uid} className="remote-user-container">
                <RemoteUser user={user} className="video-frame">
                  <div className="user-label">{user.uid}</div>
                </RemoteUser>
              </div>
            ))}
          </div>
          
          <div className="control-panel">
            <button 
              className={`control-btn ${micOn ? 'active' : 'inactive'}`}
              onClick={() => setMic(a => !a)}
            >
              <span className="btn-icon">🎤</span>
              {micOn ? "Mute" : "Unmute"}
            </button>
            
            <button 
              className={`control-btn ${cameraOn ? 'active' : 'inactive'}`}
              onClick={() => setCamera(a => !a)}
            >
              <span className="btn-icon">📹</span>
              {cameraOn ? "Stop Video" : "Start Video"}
            </button>
            
            <button
              className={`control-btn ${screenShareOn ? 'active' : 'inactive'}`}
              onClick={handleScreenShare}
            >
              <span className="btn-icon">🖥️</span>
              {screenShareOn ? "Stop Share" : "Share Screen"}
            </button>
            
            <button
              className="control-btn end-call"
              onClick={() => setCalling(a => !a)}
            >
              <span className="btn-icon">📞</span>
              End Call
            </button>
          </div>
        </div>
      ) : (
        <div className="join-form">
          <h2>Join Video Call</h2>
          <div className="form-group">
            <label>App ID</label>
            <input
              type="text"
              onChange={e => setAppId(e.target.value)}
              placeholder="Enter your app ID"
              value={appId}
              className="form-input"
            />
          </div>
          
          <div className="form-group">
            <label>Channel Name</label>
            <input
              type="text"
              onChange={e => setChannel(e.target.value)}
              placeholder="Enter channel name"
              value={channel}
              className="form-input"
            />
          </div>
          
          <div className="form-group">
            <label>Token</label>
            <input
              type="text"
              onChange={e => setToken(e.target.value)}
              placeholder="Enter your token"
              value={token}
              className="form-input"
            />
          </div>

          <button
            disabled={!appId || !channel}
            onClick={() => setCalling(true)}
            className="join-btn"
          >
            <span className="btn-icon">🚀</span>
            Join Channel
          </button>
        </div>
      )}
    </div>
  );
};
  
export default VideoCalling;