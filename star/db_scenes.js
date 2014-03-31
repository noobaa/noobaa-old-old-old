db.trackevents.find({
	event: /home\.scenes/
}).forEach(function(e) {
	print(e._id.getTimestamp(),
		'- [ ' + (e.user ? e.user.name : e.req.ip) + ' ]',
		e.event, (e.data ? e.data.name : ''));
});
