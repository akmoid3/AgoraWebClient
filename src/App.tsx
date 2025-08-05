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
import AgoraRTC, { useCurrentUID, AgoraRTCProvider, type IAgoraRTCClient, type ILocalVideoTrack } from "agora-rtc-react";
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
  const [token, setToken] = useState("007eJxTYPCbySLMmsuTPV1wlmK0xdLj+u9ap7Yo/SxaOu+yl97zyFAFBhNzA+MUQ6OUVMPENBPz1CRLEyNLk0RzUwMzE8NEY0OTeuNJGQ2BjAyKoYsYGKEQxOdlCM3LLKmMd85IzMtLzWFgAAB6+R/E");
  const [rtmToken, setRtmToken] = useState("007eJxSYNjbGuA1X/eptNSDWqNzi+bZL5xtxHUnqEraMm4mu87fSZYKDCbmBsYphkYpqYaJaSbmqUmWJkaWJonmpgZmJoaJxoYmEcaTMhoCGRl+itWxMDEwMoAwiM8CJnkZQvMySyrjnTMS8/JSc1gZCoryyxJBaiCqoAKAAAAA//+VOiZu");
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
  const [usernames, setUsernames] = useState<{ [key: string]: string }>({});

  useJoin({ appid: appId, channel: channel, token: token ? token : null }, calling);
  usePublish([localMicrophoneTrack, localCameraTrack]);
  const remoteUsers = useRemoteUsers();

  // Trova l'utente che sta condividendo lo schermo
  const screenShareUser = remoteUsers.find(user => user.uid === screenShareUID);
  const regularUsers = remoteUsers.filter(user => user.uid !== screenShareUID);
  const rtcID = useCurrentUID()?.toString() || "0";

  const initRTM = async () => {
    const { RTM } = AgoraRTM;
    const userId = username;

    try {
      const rtm = new RTM(appId, userId);


      const result = await rtm.login({ token: rtmToken || undefined });
      console.log(result);


      await rtm.subscribe(channel, {withMessage: true,
      withPresence: true,
      beQuiet: false,
      withMetadata: true,
      withLock: true,});


      // Listen for storage events to automatically update when metadata changes
      rtm.addEventListener('storage', (event) => {
        console.log('Storage event received:', event);
        if (event.channelType === 'MESSAGE' && event.storageType === 'CHANNEL') {
          fetchAllUserMappings(rtm);
          console.log('STORAGE UPDATE:', event);
        }
      });


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



      const name = {
        key: rtcID,
        value: username
      };


      const data = [name];
      const options = { addTimeStamp: true, addUserId: true };


      setRtmClient(rtm);
      console.log("RTM initialized and connected successfully");

      const result2 = await rtm.storage.setChannelMetadata(channel, "MESSAGE", data, options);
      console.log("Channel metadata set:", result2);

      await fetchAllUserMappings(rtm);

    } catch (status) {
      console.log("RTM Error:", status);
    }
  };

  const fetchAllUserMappings = async (rtmInstance = rtmClient) => {
    if (!rtmInstance) return;

    try {
      const result = await rtmInstance.storage.getChannelMetadata(channel, "MESSAGE");
      console.log("Channel metadata retrieved:", result);

      if (result && result.metadata) {
        const newUsernames: { [key: string]: string } = {};

        // Get ALL metadata first, then filter by current users
        Object.keys(result.metadata).forEach((rtcId) => {
          const userInfo = result.metadata[rtcId];
          if (userInfo && userInfo.value) {
            newUsernames[rtcId] = userInfo.value;
            console.log(`Found mapping: RTC ID ${rtcId} -> username ${userInfo.value}`);
          }
        });

        setUsernames(newUsernames);
        console.log("Updated usernames mapping:", newUsernames);
        console.log("Current remote users:", remoteUsers.map(u => u.uid.toString()));
        console.log("Local RTC ID:", rtcID);
      }
    } catch (error) {
      console.error("Failed to fetch user mappings:", error);
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

  const getUsernameByRtcId = (id: string | number): string => {
    const idrtc = id.toString();
    return usernames[idrtc] || `User ${idrtc}`;
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
              {/* Layout per screen sharing */}
              {(screenShareOn || screenShareUser) ? (
                <>
                  {/* Barra superiore con gli utenti connessi */}
                  <div className="users-bar">
                    <div className="local-user-small">
                      <LocalUser
                        audioTrack={localMicrophoneTrack}
                        cameraOn={cameraOn}
                        micOn={micOn}
                        playAudio={false}
                        videoTrack={localCameraTrack}
                        className="video-frame-small"
                      >
                        <div className="user-label-small">You</div>
                      </LocalUser>
                    </div>

                    {regularUsers.map((user) => (
                      <div key={user.uid} className="remote-user-small">
                        <RemoteUser user={user} className="video-frame-small">
                          <div className="user-label-small">{getUsernameByRtcId(user.uid)}</div>
                        </RemoteUser>
                      </div>
                    ))}
                  </div>

                  {/* Area principale per lo screen share */}
                  <div className="screen-share-area">
                    {screenShareUser ? (
                      <div className="screen-share-container">
                        <RemoteUser
                          user={screenShareUser}
                          className="screen-share-frame"
                        >
                          <div className="screen-share-label">
                            <span className="share-icon">🖥️</span>
                            Screen Shared by {getUsernameByRtcId(screenShareUser.uid)}
                          </div>
                        </RemoteUser>
                      </div>
                    ) : screenShareOn && screenTrack ? (
                      <div className="screen-share-container">
                        <div
                          className="screen-share-frame"
                          ref={(ref) => {
                            if (ref && screenTrack) {
                              // Clear any existing content
                              ref.innerHTML = '';
                              screenTrack.play(ref);
                            }
                          }}
                        >
                          <div className="screen-share-label">
                            <span className="share-icon">🖥️</span>
                            Your Screen Share
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                /* Layout normale senza screen sharing */
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

                  {regularUsers.map((user) => (
                    <div key={user.uid} className="remote-user-container">
                      <RemoteUser user={user} className="video-frame">
                        <div className="user-label">{getUsernameByRtcId(user.uid)}</div>
                      </RemoteUser>
                    </div>
                  ))}
                </div>
              )}

              <div className="control-panel">
                <button
                  className={`control-btn ${micOn ? 'active' : 'inactive'}`}
                  onClick={() => setMic(a => !a)}
                  data-tooltip={micOn ? "Mute Microphone" : "Unmute Microphone"}
                >
                  <span className="btn-icon">🎤</span>
                  <span className="btn-text">{micOn ? "Mute" : "Unmute"}</span>
                </button>

                <button
                  className={`control-btn ${cameraOn ? 'active' : 'inactive'}`}
                  onClick={() => setCamera(a => !a)}
                  data-tooltip={cameraOn ? "Turn Off Camera" : "Turn On Camera"}
                >
                  <span className="btn-icon">📹</span>
                  <span className="btn-text">{cameraOn ? "Stop Video" : "Start Video"}</span>
                </button>

                <button
                  className={`control-btn ${screenShareOn ? 'active' : 'inactive'}`}
                  onClick={handleScreenShare}
                  data-tooltip={screenShareOn ? "Stop Screen Share" : "Start Screen Share"}
                >
                  <span className="btn-icon">🖥️</span>
                  <span className="btn-text">{screenShareOn ? "Stop Share" : "Share Screen"}</span>
                </button>

                <button
                  className={`control-btn ${chatVisible ? 'active' : 'inactive'}`}
                  onClick={() => setChatVisible(!chatVisible)}
                  data-tooltip={chatVisible ? "Close Chat" : "Open Chat"}
                >
                  <span className="btn-icon">💬</span>
                  <span className="btn-text">Chat</span>
                </button>

                <button
                  className="control-btn end-call"
                  onClick={() => setCalling(a => !a)}
                  data-tooltip="End Call"
                >
                  <span className="btn-icon">📞</span>
                  <span className="btn-text">End Call</span>
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