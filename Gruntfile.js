module.exports = function(grunt) {


	// Default tasks
	grunt.registerTask('default', [
		'bower',
		'jshint'
		//,
		// 'uglify'
	]);


	// Project configuration.
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		bower: {
			install: true
		},
		jshint: {
			all: [
				'Gruntfile.js',
				'star/**/*.js',
				'planet/js/**/*.js'
			]
		}
		//,
		// uglify: {
		//	options: {
		//		banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
		//	},
		//	build: {
		//		src: 'src/<%= pkg.name %>.js',
		//		dest: 'build/<%= pkg.name %>.min.js'
		//	}
		// }
	});


	// Load the plugins
	grunt.loadNpmTasks('grunt-contrib-jshint');
	// grunt.loadNpmTasks('grunt-contrib-uglify');


	// Define custom tasks
	grunt.task.registerMultiTask('bower', 'Bower', function() {
		// Force task into async mode and grab a handle to the "done" function.
		var done = this.async();
		grunt.util.spawn({
			cmd: './node_modules/.bin/bower',
			args: [this.target]
		}, done);
	});
};