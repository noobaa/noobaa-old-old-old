function log(msg) {
	console.log(msg);
	$('#log').append('<p>' + msg + '</p>');
}

var store = new Store(100*1024*1024*1024);
store.onerror = function(err) {
	console.error(err);
	$('#log').append('<p style="color: red">' + err + '</p>');
};
store.onload = function(fs) {
	log('FS inited');
	store.query_usage();
};
store.onusage = function(usage, quota)  {
	log('Usage: ' + usage + ' Quota: ' + quota);
};

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