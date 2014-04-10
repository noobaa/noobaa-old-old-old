var map_func = function() {
	var date = this._id.getTimestamp();
	var date_bucket = date.getFullYear() + '-' + (date.getMonth() + 1);
	emit(date_bucket, 1);
}
var reduce_func = function(key, values) {
	return Array.sum(values);
}
db.users.mapReduce(map_func, reduce_func, {
	out: {
		inline: 1
	}
})['results'].forEach(function(res) {
	print(res._id, '-', res.value);
});
