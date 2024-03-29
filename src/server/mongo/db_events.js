'use strict';
db.trackevents.find({
	'user.name': {
		$ne: 'Guy Margalit'
	}
}).sort({
	time: -1
}).limit(1000).forEach(function(e) {
	var user = e.user ? e.user.name : e.req.ip;
	var data = e.data || {};
	var uid = data.uid ? '<'+data.uid+'>' : '';
	print(e._id.getTimestamp(),
		'- [ ' + user + ' ]',
		e.event, uid, data.name||'');
});
