print('Name , Email , Joined');
db.users.find().sort({_id:1}).forEach(function(user) {
	var name = user.fb && user.fb.name || user.google && user.google.name || '';
	var email = user.email || user.fb && user.fb.email || user.google && user.google.email || '';
	print(name + ' , ' + email + ' , ' + user._id.getTimestamp());
});