db.clubmsgs.find({}).sort({
	time: 1
}).forEach(function(m) {
	print(m.time, '- [ ' + m.club + ' / ' + m.user + ' ]', m.text, m.inode);
});
