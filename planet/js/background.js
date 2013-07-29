chrome.app.runtime.onLaunched.addListener(function() {
	chrome.app.window.create('views/main.html', {
		bounds: {
			'width': 400,
			'height': 500
		}
	});
});