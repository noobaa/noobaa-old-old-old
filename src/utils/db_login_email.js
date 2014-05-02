db.trackevents.find({
	$or: [{
		event: 'user.login_email'
	}, {
		event: 'login.email'
	}]
}).sort({
	time: 1
}).forEach(function(e) {
	print(e._id.getTimestamp(), '-', e.data.email);
});
