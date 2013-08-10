$(function() {
	var nb_tour = new Tour({
		backdrop: true,
		template: [
			'<div class="popover tour fntread" style="width: 800px; background-color: #f2f2f2; color: black;">',
			'<div class="arrow"></div>',
			// '<h3 class="popover-title"></h3>',
			'<div class="popover-content"></div>',
			'<div class="popover-navigation">',
			'<button class="btn" data-role="end"',
			'style="float: left !important">Close</button>',
			'<button class="btn" data-role="prev"',
			'style="float: none !important">« Prev</button>',
			'<button class="btn btn-primary" data-role="next"',
			'style="float: right !important">Next »</button>',
			'</div>',
			'</div>'
		].join('\n')
	});

	nb_tour.addSteps([{
		element: "#logo_link", // jQuery selector
		placement: 'bottom',
		// reflex: true,
		// title: "NooBaa",
		content: [
			'<h2>WELCOME TO NOOBAA</h2>',
			'<p class="lead">We want to show you around...<br/>',
			'So press next...<br/></p>'
		].join('\n')
	}, {
		element: "#my_data_link",
		placement: 'bottom',
		// reflex: true,
		// title: "MY DATA",
		content: '<p class="lead">This is your MY DATA page ... </p>'
	}, {
		element: "#my_dev_link",
		placement: 'bottom',
		// reflex: true,
		// title: "MY DEVICES",
		content: '<p class="lead">This is your MY DEVICES page ... </p>'
	}]);

	// start from last point
	nb_tour.start();

	$('#tour_link').click(function() {
		nb_tour.end();
		nb_tour.restart();
	});
});