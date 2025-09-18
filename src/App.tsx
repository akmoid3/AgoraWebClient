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
const TOKEN_SERVER_BASE_URL = "http://127.0.0.1:5000";

export const VideoCalling = () => {
  const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  // Forza il remount di <Basics /> cambiando la chiave
  const [instanceKey, setInstanceKey] = useState(0);

  return (
    <AgoraRTCProvider client={client}>
      <Basics
        key={instanceKey}
        onRequestDestroy={() => setInstanceKey(k => k + 1)}
      />
    </AgoraRTCProvider>
  );
}

const Basics = ({ onRequestDestroy }: { onRequestDestroy?: () => void }) => {
  const [calling, setCalling] = useState(false);
  const isConnected = useIsConnected();
  const appId = "aa9b36dd3320409b808cd5463cd4ef39";
  const [channel, setChannel] = useState("Classe");
  const [token, setToken] = useState<string>("");              
  const [rtmToken, setRtmToken] = useState<string>("");        
  const [uid, setUid] = useState<number | null>(null);         
  const [loadingJoin, setLoadingJoin] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
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
  // Raise hand state
  const [raisedHands, setRaisedHands] = useState<{ [key: string]: boolean }>({});
  const [isHandRaised, setIsHandRaised] = useState(false);

  useJoin({ appid: appId, channel: channel, token: token || null, uid: uid ?? undefined }, calling);
  usePublish([localMicrophoneTrack, localCameraTrack]);
  const remoteUsers = useRemoteUsers();

  // Trova l'utente che sta condividendo lo schermo
  const screenShareUser = remoteUsers.find(user => user.uid === screenShareUID);
  const regularUsers = remoteUsers.filter(user => user.uid !== screenShareUID);
  const rtcID = useCurrentUID()?.toString() || "0";

  // --- Token fetch helpers ---
  const fetchRtcToken = async (requestUid: number) => {
    const url = `${TOKEN_SERVER_BASE_URL}/token/uid?channelName=${encodeURIComponent(channel)}&uid=${requestUid}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`RTC token fetch failed (${res.status})`);
    const data = await res.json();
    if (!data.token) throw new Error("RTC token missing in response");
    return data.token as string;
  };

  const fetchRtmToken = async (account: string) => {
    const url = `${TOKEN_SERVER_BASE_URL}/token/rtm?channelName=${encodeURIComponent(channel)}&account=${encodeURIComponent(account)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`RTM token fetch failed (${res.status})`);
    const data = await res.json();
    if (!data.token) throw new Error("RTM token missing in response");
    return data.token as string;
  };

  const handleJoin = async () => {
    setJoinError(null);
    setLoadingJoin(true);
    try {
      // Generate a UID 
      let newUid = Math.floor(Math.random() * 900000) + 1000;
      if (newUid === screenShareUID) newUid += 1;
      const [rtcTok, rtmTok] = await Promise.all([
        fetchRtcToken(newUid),
        fetchRtmToken(username)
      ]);
      setUid(newUid);
      setToken(rtcTok);
      setRtmToken(rtmTok);
      setCalling(true);
    } catch (e: any) {
      console.error(e);
      setJoinError(e.message || "Join failed");
    } finally {
      setLoadingJoin(false);
    }
  };

  // Refresh tokens before expiry (simple interval ~55 mins for 60 min validity)
  useEffect(() => {
    if (!calling || !uid || !username) return;
    const refreshMs = 55 * 60 * 1000;
    const interval = setInterval(async () => {
      try {
        const [rtcTok, rtmTok] = await Promise.all([
          fetchRtcToken(uid),
          fetchRtmToken(username)
        ]);
        setToken(rtcTok);
        setRtmToken(rtmTok);
        console.log("Tokens refreshed");
      } catch (err) {
        console.warn("Token refresh failed", err);
      }
    }, refreshMs);
    return () => clearInterval(interval);
  }, [calling, uid, username, channel]);

  
  const startScreenShare = async () => {
    try {
      const newScreenClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

      const screenToken = await fetchRtcToken(screenShareUID);

      await newScreenClient.join(appId, channel, screenToken || null, screenShareUID);

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


  const initRTM = async () => {
    if (!rtmToken) return; // ensure token fetched
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
        const newRaised: { [key: string]: boolean } = {};

        // Parse metadata entries: numeric keys are usernames, hand:<rtcId> are raise-hand flags
        Object.keys(result.metadata).forEach((key) => {
          const entry = result.metadata[key];
          const value: string | undefined = entry?.value;
          if (!value) return;

          if (key.startsWith("hand:")) {
            const rtcId = key.slice(5);
            newRaised[rtcId] = value === "1" || value === "true";
          } else if (/^\d+$/.test(key)) {
            newUsernames[key] = value;
            console.log(`Found mapping: RTC ID ${key} -> username ${value}`);
          }
        });

        setUsernames(newUsernames);
        setRaisedHands(newRaised);
        setIsHandRaised(Boolean(newRaised[rtcID]));
        console.log("Updated usernames mapping:", newUsernames);
        console.log("Updated raised hands:", newRaised);
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

  // Raise/lower hand using Channel Metadata
  const setHandMetadata = async (raised: boolean) => {
    if (!rtmClient || !rtcID) return;
    const handKey = `hand:${rtcID}`;
    try {
      if (raised) {
        const data = [{ key: handKey, value: "1" }];
        await rtmClient.storage.setChannelMetadata(
          channel,
          "MESSAGE",
          data,
          { addTimeStamp: true, addUserId: true }
        );
      } else {
        await rtmClient.storage.removeChannelMetadata(
          channel,
          "MESSAGE",
          { data: [{ key: handKey }] }
        );
      }
      setIsHandRaised(raised);
      setRaisedHands(prev => ({ ...prev, [rtcID]: raised }));
    } catch (e) {
      console.warn("Failed to update hand metadata", e);
    }
  };

  const toggleHand = () => setHandMetadata(!isHandRaised);

  const removeSelfMetadata = async () => {
    if (!rtmClient || !rtcID) return;
     const name = {
        key: rtcID,
      };


      const toremove = [name];
      const options = {
        data: toremove,
      };

    try {
      const result = await rtmClient.storage.removeChannelMetadata(
        channel,
        "MESSAGE",
        options
      );
      console.log("Removed own metadata key:", result);
    } catch (e) {
      console.warn("Failed to remove own metadata", e);
    }

    // Also remove own raise-hand key if present
    try {
      const res2 = await rtmClient.storage.removeChannelMetadata(
        channel,
        "MESSAGE",
        { data: [{ key: `hand:${rtcID}` }] }
      );
      console.log("Removed own hand metadata key:", res2);
    } catch (e) {
      console.warn("Failed to remove own hand metadata", e);
    }
  };



  // Handler "End Call": stop share, clear metadata, unsubscribe, logout, reset stato
  const handleLeave = async () => {
    try {
      if (screenShareOn) await stopScreenShare();

      await removeSelfMetadata(); 

      if (rtmClient) {
        try { await rtmClient.unsubscribe(channel); } catch (e) { console.warn("RTM unsubscribe failed", e); }
        try { await rtmClient.logout(); } catch (e) { console.warn("RTM logout failed", e); }
      }
    } finally {
      // Lascio il canale distruggendo il componente
      onRequestDestroy?.();
    }
  };

  useEffect(() => {
    if (isConnected && rtmToken) {
      initRTM();
    }
  }, [isConnected, rtmToken]);

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
                        <div className="user-label-small">You {isHandRaised && <span className="hand-badge">✋</span>}</div>
                      </LocalUser>
                    </div>

                    {regularUsers.map((user) => (
                      <div key={user.uid} className="remote-user-small">
                        <RemoteUser user={user} className="video-frame-small">
                          <div className="user-label-small">
                            {getUsernameByRtcId(user.uid)} {raisedHands[user.uid.toString()] && <span className="hand-badge">✋</span>}
                          </div>
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
                            Screen Share
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
                      <div className="user-label">You {isHandRaised && <span className="hand-badge">✋</span>}</div>
                    </LocalUser>
                  </div>

                  {regularUsers.map((user) => (
                    <div key={user.uid} className="remote-user-container">
                      <RemoteUser user={user} className="video-frame">
                        <div className="user-label">
                          {getUsernameByRtcId(user.uid)} {raisedHands[user.uid.toString()] && <span className="hand-badge">✋</span>}
                        </div>
                      </RemoteUser>
                    </div>
                  ))}
                </div>
              )}

              <div className="control-panel">
                <button
                  className={`control-btn ${isHandRaised ? 'active' : 'inactive'}`}
                  onClick={toggleHand}
                  disabled={!rtmClient}
                  data-tooltip={isHandRaised ? "Lower Hand" : "Raise Hand"}
                >
                  <span className="btn-icon">✋</span>
                  <span className="btn-text">{isHandRaised ? "Lower Hand" : "Raise Hand"}</span>
                </button>
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
                  onClick={handleLeave}
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
            <label>Channel Name</label>
            <input
              type="text"
              onChange={e => setChannel(e.target.value)}
              placeholder="Enter channel name"
              value={channel}
              className="form-input"
            />
          </div>

          {joinError && <div style={{color: 'red', marginBottom: 8}}>{joinError}</div>}
          <button
            disabled={!appId || !channel || !username || loadingJoin}
            onClick={handleJoin}
            className="join-btn"
          >
            <span className="btn-icon">{loadingJoin ? "⏳" : "🚀"}</span>
            {loadingJoin ? "Joining..." : "Join Channel"}
          </button>
        </div>
      )}
    </div>
  );
};

export default VideoCalling;