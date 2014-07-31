db.clubs.find({}).sort({
	mtime: 1
}).forEach(function(c) {
	print(c.mtime, c.title);
	c.members.forEach(function(m) {
		print('\t', 'user ' + m.user, 'seen_msg ' + m.seen_msg, m.admin ? 'ADMIN' : '');
	});
});
