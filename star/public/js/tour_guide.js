$(function() {
	var nb_tour = new Tour({
		backdrop: true,
		template: [
			'<div class="popover tour fntread bglight">',
			'  <div class="arrow"></div>',
			// '  <h3 class="popover-title"></h3>',
			'  <div class="popover-content"></div>',
			'  <div class="popover-navigation">',
			'    <button class="btn" data-role="end">Close</button>',
			'    <div class="btn-group" style="float: right">',
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
		// reflex: true,
		// title: "NooBaa",
		content: [
			'<h3>WELCOME TO NOOBAA !</h3>',
			'<p class="lead">We want to show you around.<br/>',
			'Press next...<br/>(or use left & right keys)<br/></p>'
		].join('\n')
	}, {
		element: "#my_data_link",
		placement: 'bottom',
		// reflex: true,
		// title: "MY DATA",
		content: '<h3>This is your MY DATA page ... </h3>'
	}, {
		element: "#my_dev_link",
		placement: 'bottom',
		// reflex: true,
		// title: "MY DEVICES",
		content: '<h3>This is your MY DEVICES page ... </h3>'
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