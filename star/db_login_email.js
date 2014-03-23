db.trackevents.find({event:'login.email'}).forEach(function(e) {
	print(e._id.getTimestamp(), e.data.email);
});
