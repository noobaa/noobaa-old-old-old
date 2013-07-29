var BIG_FILE = 30 * 1024 * 1024;

function log(message) {
	console.log(message);
	document.getElementById('log').textContent += message + '\n';
}

document.getElementById('request-quota').onclick = function() {
	window.webkitStorageInfo.requestQuota(
		window.PERSISTENT,
		BIG_FILE,
		function(grantedBytes) {
			log('Granted ' + grantedBytes)
		},
		function(e) {
			log('Error: ' + e);
		});
};

document.getElementById('query-quota').onclick = function() {
	window.webkitStorageInfo.queryUsageAndQuota(
		window.PERSISTENT,
		function(usage, quota) {
			log('usage ' + usage + ' quota ' + quota)
		},
		function(e) {
			log('Error: ' + e);
		});
};

document.getElementById('request-filesystem').onclick = function() {
	window.webkitRequestFileSystem(
		PERSISTENT,
		BIG_FILE,
		function(fs) {
			log('Filesystem: ' + fs);

			fs.root.getFile(
				'test.txt', {
					create: true,
					exclusive: true
				},
				function(fileEntry) {
					log('fileEntry: ' + fileEntry);
					fileEntry.createWriter(function(fileWriter) {
						log('fileWriter: ' + fileWriter);
						fileWriter.onwriteend = function(e) {
							log('Write completed.');
						};

						fileWriter.onerror = function(e) {
							log('Write failed: ' + e.toString());
						};

						var bb = new WebKitBlobBuilder(); // Note: window.WebKitBlobBuilder in Chrome 12.
						for (var i = 0; i < BIG_FILE / 50; i++) {
							bb.append('01234567890123456789012345678901234567890123456789');
						}
						fileWriter.write(bb.getBlob('text/plain'));
					}, function(e) {
						log('Error: ' + e);
					});
				});
		},
		function(e) {
			log('Error' + e);
		});
};



var sendChannel, receiveChannel;

var startButton = document.getElementById("startButton");
var sendButton = document.getElementById("sendButton");
var closeButton = document.getElementById("closeButton");
startButton.disabled = false;
sendButton.disabled = true;
closeButton.disabled = true;
startButton.onclick = createConnection;
sendButton.onclick = sendData;
closeButton.onclick = closeDataChannels;

function trace(text) {
  console.log((performance.now() / 1000).toFixed(3) + ": " + text);
}

function createConnection() {
  var servers = null;
  window.localPeerConnection = new webkitRTCPeerConnection(servers, {
    optional: [{
      RtpDataChannels: true
    }]
  });
  trace('Created local peer connection object localPeerConnection');

  try {
    // Reliable Data Channels not yet supported in Chrome
    sendChannel = localPeerConnection.createDataChannel("sendDataChannel", {
      reliable: false
    });
    trace('Created send data channel');
  } catch (e) {
    alert('Failed to create data channel. ' +
      'You need Chrome M25 or later with RtpDataChannel enabled');
    trace('createDataChannel() failed with exception: ' + e.message);
  }
  localPeerConnection.onicecandidate = gotLocalCandidate;
  sendChannel.onopen = handleSendChannelStateChange;
  sendChannel.onclose = handleSendChannelStateChange;

  window.remotePeerConnection = new webkitRTCPeerConnection(servers, {
    optional: [{
      RtpDataChannels: true
    }]
  });
  trace('Created remote peer connection object remotePeerConnection');

  remotePeerConnection.onicecandidate = gotRemoteIceCandidate;
  remotePeerConnection.ondatachannel = gotReceiveChannel;

  localPeerConnection.createOffer(gotLocalDescription);
  startButton.disabled = true;
  closeButton.disabled = false;
}

function sendData() {
  var data = document.getElementById("dataChannelSend").value;
  sendChannel.send(data);
  trace('Sent data: ' + data);
}

function closeDataChannels() {
  trace('Closing data channels');
  sendChannel.close();
  trace('Closed data channel with label: ' + sendChannel.label);
  receiveChannel.close();
  trace('Closed data channel with label: ' + receiveChannel.label);
  localPeerConnection.close();
  remotePeerConnection.close();
  localPeerConnection = null;
  remotePeerConnection = null;
  trace('Closed peer connections');
  startButton.disabled = false;
  sendButton.disabled = true;
  closeButton.disabled = true;
  dataChannelSend.value = "";
  dataChannelReceive.value = "";
  dataChannelSend.disabled = true;
  dataChannelSend.placeholder = "Press Start, enter some text, then press Send.";
}

function gotLocalDescription(desc) {
  localPeerConnection.setLocalDescription(desc);
  trace('Offer from localPeerConnection \n' + desc.sdp);
  remotePeerConnection.setRemoteDescription(desc);
  remotePeerConnection.createAnswer(gotRemoteDescription);
}

function gotRemoteDescription(desc) {
  remotePeerConnection.setLocalDescription(desc);
  trace('Answer from remotePeerConnection \n' + desc.sdp);
  localPeerConnection.setRemoteDescription(desc);
}

function gotLocalCandidate(event) {
  trace('local ice callback');
  if (event.candidate) {
    remotePeerConnection.addIceCandidate(event.candidate);
    trace('Local ICE candidate: \n' + event.candidate.candidate);
  }
}

function gotRemoteIceCandidate(event) {
  trace('remote ice callback');
  if (event.candidate) {
    localPeerConnection.addIceCandidate(event.candidate);
    trace('Remote ICE candidate: \n ' + event.candidate.candidate);
  }
}

function gotReceiveChannel(event) {
  trace('Receive Channel Callback');
  receiveChannel = event.channel;
  receiveChannel.onmessage = handleMessage;
  receiveChannel.onopen = handleReceiveChannelStateChange;
  receiveChannel.onclose = handleReceiveChannelStateChange;
}

function handleMessage(event) {
  trace('Received message: ' + event.data);
  document.getElementById("dataChannelReceive").value = event.data;
}

function handleSendChannelStateChange() {
  var readyState = sendChannel.readyState;
  trace('Send channel state is: ' + readyState);
  if (readyState == "open") {
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    dataChannelSend.placeholder = "";
    sendButton.disabled = false;
    closeButton.disabled = false;
  } else {
    dataChannelSend.disabled = true;
    sendButton.disabled = true;
    closeButton.disabled = true;
  }
}

function handleReceiveChannelStateChange() {
  var readyState = receiveChannel.readyState;
  trace('Receive channel state is: ' + readyState);
}



// // APIs

// var RequestFS = window.requestFileSystem || window.webkitRequestFileSystem;
// var Storage = navigator.webkitPersistentStorage;

// // Config and Callbacks

// var fssize = 1024*1024*1024;

// var fs_error = function(err) {
//   console.error(err);
// };

// var quota_error = function(err) {
//   console.error(err);
// };

// var fs_init = function(fs) {
//   console.log("FS inited.", fs);
// };

// var quota_init = function(quota_fssize) {
//   RequestFS(
//     window.PERSISTENT,
//     quota_fssize,
//     fs_init,
//     quota_error
//   );
// };

// Storage.requestQuota(
//   fssize,
//   quota_init,
//   quota_error
// );


// var servers = {
//   "iceServers": [{
//     "url": "stun:23.21.150.121"
//   }]
// };
// var options = {
//   'optional': [{
//     'DtlsSrtpKeyAgreement': true
//   }, {
//     'RtpDataChannels': true
//   }]
// };

// var pc = new RTCPeerConnection(servers, options);
// log('GG');
// console.log(pc);
// log('HH');
