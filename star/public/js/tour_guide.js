$(function() {
	var nb_tour = new Tour({
		debug: true,
		template: [
			'<div class="popover tour fntread bglight">',
			'  <div class="arrow"></div>',
			'  <h1 class="popover-title fntpaint"></h1>',
			'  <div class="popover-content fntpaint"></div>',
			'  <div class="popover-navigation modal-footer">',
			'    <button class="btn pull-left" data-role="end">Close</button>',
			'    <div class="btn-group">',
			'      <button class="btn" data-role="prev">« Prev</button>',
			'      <button class="btn btn-primary" data-role="next">Next »</button>',
			'    </div>',
			'  </div>',
			'</div>'
		].join('\n')
	});

	nb_tour.addSteps([{
		element: "#tour_link", // jQuery selector
		placement: 'bottom',
		backdrop: true,
		title: "WELCOME TO NOOBAA !",
		content: [
			'<p class="lead">This tour will show you around.</p>',
			'<p class="lead">It\'s all free, and you\'ll be up and running in a minute.</p>',
			'<p class="lead">Press Next...</p>',
			// '<p>* You can also navigate this tour using the left & right arrow keys</p>',
			// '<p>* This tour is always available using the',
			// '<i class="icon-info-sign text-info"></i> button at the top</p>'
		].join('\n')
	}, {
		element: "#my_data_link",
		placement: 'bottom',
		backdrop: true,
		title: "MY DATA",
		content: [
			'<p class="lead">This is where you manage your files.</p>'
		].join('\n')
	}, {
		element: "#my_dev_link",
		placement: 'bottom',
		backdrop: true,
		title: "MY DEVICES",
		content: [
			'<p class="lead">This is where you manage your devices.</p>'
		].join('\n')
	}, {
		element: "#add_dev_btn",
		placement: 'bottom',
		reflex: true,
		path: "/mydevices#/mydevices", // TODO: the #/mydevices is needed due to angular bug
		title: "Add Device",
		content: [
			'<p class="lead">Start co-sharing by installing your first device.</p>'
		].join('\n')
	}, {
		element: "#my_data_link",
		placement: 'bottom',
		reflex: true,
		path: "/mydevices#/mydevices",
		title: "First device added",
		content: [
			'<p class="lead">Once your device is up and running,',
			'you are co-sharing and enjoying the power of NooBaa\'s crowd-cloud!</p>',
			'<p class="lead">Lets go and meet your data...</p>'
		].join('\n')
	}, {
		element: "#my_data_link",
		placement: 'bottom',
		path: "/mydata#/mydata",
		title: "MY DATA",
		content: [
			'<p class="lead">Let\'s see how to manage your data...</p>'
		].join('\n')
	}]);

	$('#tour_link').click(function() {
		if (!nb_tour.ended()) {
			if (!confirm('End and restart the Tour?')) {
				return;
			}
		}
		// stop current tour
		nb_tour.end();
		// restart the tour from the beginning
		nb_tour.restart();
	});

	// when loading the page open the tour from last point
	// as saved in the local storage.
	nb_tour.start();
});