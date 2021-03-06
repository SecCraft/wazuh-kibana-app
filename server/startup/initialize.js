module.exports = function (server, options) {


	// Elastic JS Client
	const serverConfig = server.config();
	const elasticsearchURL = serverConfig.get('elasticsearch.url');
	const elasticsearch = require('elasticsearch');
	const client = new elasticsearch.Client({
	  host: elasticsearchURL,
	  apiVersion: '5.0'
	});
	
	// External libraries
    const uiSettings = server.uiSettings();
    const fs = require('fs');
    const path = require('path');

	// Colors for console logging 
    const colors = require('ansicolors');
    const blueWazuh = colors.blue('wazuh');

	// Initialize variables
	var req = { path : "", headers : {}};
	var index_pattern = "wazuh-alerts-*";
	var index_prefix = "wazuh-alerts-";

	// External files template or objects
	const OBJECTS_FILE = 'integration_files/objects_file.json';
	const TEMPLATE_FILE = 'integration_files/template_file.json';
	const KIBANA_FIELDS_FILE = 'integration_files/kibana_fields_file.json';

	// Initialize objects
	var kibana_fields_data = {};
	var map_jsondata = {};
	var objects = {};

	var packageJSON = {};

	// Read config from package JSON
	packageJSON = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
	
	// Today
	var fDate = new Date().toISOString().replace(/T/, '-').replace(/\..+/, '').replace(/-/g, '.').replace(/:/g, '').slice(0, -7);
    var todayIndex = index_prefix + fDate;

	// Save Wazuh App first set up for further updates
	var saveSetupInfo = function (type) {
        var setup_info = {"name" : "Wazuh App", "app-version": packageJSON.version, "revision": packageJSON.revision, "installationDate": new Date().toISOString() };
		
		if(type == "install"){
			client.create({ index: ".kibana", type: 'wazuh-setup', id: 1, body: setup_info }).then(
				function () {
					server.log([blueWazuh, 'initialize', 'info'], 'Wazuh set up info inserted');
				}, function () {
					server.log([blueWazuh, 'initialize', 'error'], 'Could not insert Wazuh set up info');
				});
		}
		
		if(type == "upgrade"){
			client.update({ index: ".kibana", type: 'wazuh-setup', id: 1, body: {doc: setup_info}}).then(
				function () {
					server.log([blueWazuh, 'initialize', 'info'], 'Wazuh set up info updated');
				}, function () {
					server.log([blueWazuh, 'initialize', 'error'], 'Could not upgrade Wazuh set up info');
				});
		}
    };

	// Setting default index pattern
	var setDefaultIndex = function () {
        server.log([blueWazuh, 'initialize', 'info'], 'Setting Kibana default index pattern to "'+index_pattern+'"...');

        uiSettings.set(req,'defaultIndex', index_pattern)
            .then(function (data) {
                server.log([blueWazuh, 'initialize', 'info'], 'Default index pattern set to: ' + index_pattern);
				// We have almost everything configure, setting up default time picker.
				setDefaultTime();
            }).catch(function (data) {
                server.log([blueWazuh, 'initialize', 'error'], 'Could not set default index pattern: '+index_pattern);
                server.log([blueWazuh, 'initialize', 'error'], data);
            });


    };

	// Create index pattern
	var createIndexPattern = function (type) {
		
		if(type == "install"){
			
			try {
			  kibana_fields_data = JSON.parse(fs.readFileSync(path.resolve(__dirname, KIBANA_FIELDS_FILE), 'utf8'));
			} catch (e) {
			  server.log([blueWazuh, 'initialize', 'error'], 'Could not read the mapping file.');
			  server.log([blueWazuh, 'initialize', 'error'], 'Path: ' + KIBANA_FIELDS_FILE);
			  server.log([blueWazuh, 'initialize', 'error'], 'Exception: ' + e);
			};

			server.log([blueWazuh, 'initialize', 'info'], 'Creating index pattern: ' + index_pattern);
			client.create({ index: '.kibana', type: 'index-pattern', id: index_pattern, body: { title: index_pattern, timeFieldName: '@timestamp', fields: kibana_fields_data.wazuh_alerts } })
				.then(function () {
					server.log([blueWazuh, 'initialize', 'info'], 'Created index pattern: ' + index_pattern);
					// Once index pattern is created, set it as default, wait few seconds for Kibana.
					setTimeout(function () {
						setDefaultIndex();
					}, 2000)
				}, function (response) {
					if (response.statusCode != '409') {
						server.log([blueWazuh, 'initialize', 'error'], 'Could not configure index pattern:' + index_pattern);
					} else {
						server.log([blueWazuh, 'initialize', 'info'], 'Skipping index pattern configuration: Already configured:' + index_pattern);
					}
				});
		}
    };

	// Configure Kibana status: Index pattern, default index pattern, default time, import dashboards.
	var configureKibana = function (type) {
        server.log([blueWazuh, 'initialize', 'info'], 'Configuring Kibana for working with "'+index_pattern+'" index pattern...');

		// Create Index Pattern > Set it as default > Set default time
		createIndexPattern(type);

		// Import objects
		importObjects(type);

		// Save Setup Info
		saveSetupInfo(type);

    };


	// Init function. Check for "wazuh-setup" document existance.
    var init = function () {
        client.get({ index: ".kibana", type: "wazuh-setup", id: "1" }).then(
            function (data) {
                server.log([blueWazuh, 'initialize', 'info'], 'Wazuh-setup document already exists. Proceed to upgrade.');
				install("upgrade");
            }, function (data) {
                server.log([blueWazuh, 'initialize', 'info'], 'Wazuh-setup document does not exist. Initializating configuration...');
                install("install");
            }
        );
    };

	// New install
	var install = function (type) {
		loadTemplate(type);
	}
	
    var loadTemplate = function (type) {
		try {
			map_jsondata = JSON.parse(fs.readFileSync(path.resolve(__dirname, TEMPLATE_FILE), 'utf8'));
		} catch (e) {
			server.log([blueWazuh, 'initialize', 'error'], 'Could not read the mapping file.');
			server.log([blueWazuh, 'initialize', 'error'], 'Path: ' + TEMPLATE_FILE);
			server.log([blueWazuh, 'initialize', 'error'], 'Exception: ' + e);
		};

		client.indices.putTemplate( {name: "wazuh", order: 0, body: map_jsondata}).then(
			function () {
				server.log([blueWazuh, 'initialize', 'info'], 'Template installed and loaded: ' +  index_pattern);
				configureKibana(type);
			}, function (data) {
				server.log([blueWazuh, 'initialize', 'error'], 'Could not install template ' +  index_pattern);
			});
    };

    var setDefaultTime = function () {

        server.log([blueWazuh, 'initialize', 'info'], 'Setting Kibana default time to last 24h...');
        uiSettings.set(req,'timepicker:timeDefaults', '{  \"from\": \"now-24h\",  \"to\": \"now\",  \"mode\": \"quick\"}')
            .then(function () {
				server.log([blueWazuh, 'initialize', 'info'], 'Kibana default time set to Last 24h.');
            }).catch(function (data) {
                server.log([blueWazuh, 'initialize', 'warning'], 'Could not set default time. Please, configure it manually.');
                server.log([blueWazuh, 'initialize', 'warning'], data);
            });
    };

    var importObjects = function (type) {
		
		if(type == "install"){
			server.log([blueWazuh, 'initialize', 'info'], 'Importing objects (Searches, visualizations and dashboards) into Elasticsearch...');
			try {
				objects = JSON.parse(fs.readFileSync(path.resolve(__dirname, OBJECTS_FILE), 'utf8'));
			} catch (e) {
				server.log([blueWazuh, 'initialize', 'error'], 'Could not read the objects file.');
				server.log([blueWazuh, 'initialize', 'error'], 'Path: ' + OBJECTS_FILE);
				server.log([blueWazuh, 'initialize', 'error'], 'Exception: ' + e);
			}

			var body = '';
			objects.forEach(function (element) {
				body += '{ "index":  { "_index": ".kibana", "_type": "'+element._type+'", "_id": "'+element._id+'" } }\n';
				body += JSON.stringify(element._source) + "\n";
			});

			client.bulk({
				index: '.kibana',
				body: body
			}).then(function () {
				client.indices.refresh({ index: ['.kibana', index_pattern] });
				server.log([blueWazuh, 'initialize', 'info'], 'Templates, mappings, index patterns, visualizations, searches and dashboards were successfully installed. App ready to be used.');
			}, function (err) {
				server.log([blueWazuh, 'server', 'error'], 'Error importing objects into elasticsearch. Bulk request failed.');
			});
		};
	}

    init();

};
