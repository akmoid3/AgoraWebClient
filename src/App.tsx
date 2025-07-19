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
import AgoraRTM from 'agora-rtm-sdk';
import { useState, useEffect } from "react";
import AgoraRTC, { AgoraRTCProvider, type IAgoraRTCClient, type ILocalVideoTrack } from "agora-rtc-react";
import "./App.css";


const screenShareUID = 10001


export const VideoCalling = () => {
  const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  return (
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
  const [token, setToken] = useState("007eJxTYGBh5/u0J9ts5onGOk3JDTN82ctLXlrfSGZp4DiWsnnODmUFBhNzA+MUQ6OUVMPENBPz1CRLEyNLk0RzUwMzE8NEY0MT8YPVGQ2BjAyycstYGRkgEMTnZQjNyyypjHfOSMzLS81hYAAAk9EfvQ==");
  const [rtmToken, setRtmToken] = useState("007eJxSYPiwVq1D/5vr+eL2NPGuE31d0g/UXzYGWMT+Xf+s+ds0uxgFBhNzA+MUQ6OUVMPENBPz1CRLEyNLk0RzUwMzE8NEY0OT1tvVGQ2BjAx5MZ2sTAyMDCAM4rOASV6G0LzMksp454zEvLzUHGYGQyNjkAqIGjAXEAAA//9dRybY");
  const [micOn, setMic] = useState(true);
  const [cameraOn, setCamera] = useState(true);
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micOn);
  const { localCameraTrack } = useLocalCameraTrack(cameraOn);

  // Screen sharing state
  const [screenShareOn, setScreenShare] = useState(false);
  const [screenClient, setScreenClient] = useState<IAgoraRTCClient | null>(null);
  const [screenTrack, setScreenTrack] = useState<ILocalVideoTrack | null>(null);
  const [username, setUsername] = useState("");
  const [rtmClient, setRtmClient] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [chatVisible, setChatVisible] = useState(false);

  useJoin({ appid: appId, channel: channel, token: token ? token : null }, calling);
  usePublish([localMicrophoneTrack, localCameraTrack]);

  const remoteUsers = useRemoteUsers();

  const initRTM = async () => {
    const { RTM } = AgoraRTM;
    const userId = username;

    try {
      const rtm = new RTM(appId, userId);

      // Login to RTM using the token from the form
      const result = await rtm.login({ token: rtmToken || undefined });
      console.log(result);

      // Subscribe to channel
      await rtm.subscribe(channel);

      // Listen for messages
      rtm.addEventListener('message', (event) => {
        console.log('Message received:', event);
        if (event.publisher == username)
          return;
        setMessages(prev => [...prev, {
          id: Date.now(),
          sender: event.publisher,
          message: event.message,
          timestamp: Date.now()
        }]);
      });

      setRtmClient(rtm);
      console.log("RTM initialized and connected successfully");

    } catch (status) {
      console.log("RTM Error:", status);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !rtmClient) return;

    try {
      await rtmClient.publish(channel, newMessage);
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: username,
        message: newMessage,
        timestamp: Date.now()
      }]);
      setNewMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  // Screen sharing functions
  const startScreenShare = async () => {
    try {
      const newScreenClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

      await newScreenClient.join(appId, channel, token || null, screenShareUID);

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

  useEffect(() => {
    if (isConnected) {
      initRTM();
    }
  }, [isConnected]);
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
        <>
          <div className={`video-call-area ${chatVisible ? 'chat-open' : ''}`}>
            <div className="video-call-content">
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
                  className={`control-btn ${chatVisible ? 'active' : 'inactive'}`}
                  onClick={() => setChatVisible(!chatVisible)}
                >
                  <span className="btn-icon">💬</span>
                  Chat
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
          </div>

          <div className={`chat-container ${chatVisible ? 'show' : ''}`}>
            <div className="chat-header">
              <h3>Chat</h3>
              <button className="close-chat" onClick={() => setChatVisible(false)}>✖️</button>
            </div>

            <div className="chat-messages">
              {messages.map(msg => (
                <div key={msg.id} className={`message ${msg.sender === username ? 'sent' : 'received'}`}>
                  <span className="message-sender">{msg.sender}</span>
                  <span className="message-text">{msg.message}</span>
                </div>
              ))}
            </div>

            <div className="chat-input">
              <textarea
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Write your message..."
                className="form-input"
                rows={1}
                style={{
                  minHeight: '48px',
                  maxHeight: '120px',
                  resize: 'none',
                  overflow: 'auto'
                }}
              />

              <button
                onClick={sendMessage}
                className="send-btn"
                disabled={!newMessage.trim()}
              >
                <span className="btn-icon">📤</span>
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="join-form">
          <h2>Join Video Call</h2>

          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username"
              value={username}
              className="form-input"
            />
          </div>

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
            <label>RTC Token</label>
            <input
              type="text"
              onChange={e => setToken(e.target.value)}
              placeholder="Enter your RTC token"
              value={token}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>RTM Token</label>
            <input
              type="text"
              onChange={e => setRtmToken(e.target.value)}
              placeholder="Enter your RTM token (optional)"
              value={rtmToken}
              className="form-input"
            />
          </div>

          <button
            disabled={!appId || !channel || !username}
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