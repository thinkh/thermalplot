PIPES-VS-DAMS CloudGazer
========================

CloudGazer supports streaming of time-dependent data for multiple items and is specialized on visualizing cloud-based IT infrastructures. The infrastructure is divided into multiple perspectives and visualized independently. Please see the [CloudGazer paper](http://dx.doi.org/10.1109/PACIFICVIS.2015.7156375) for detailed information about this approach.

The implementation is based on the [Tornado](http://www.tornadoweb.org/) framework written in Python for the back end and HTML/CSS and JavaScript for the front end. 

Features:

* Support for streaming-data via WebSocket connection
* Multiple use cases
* Flexible visualizations components

CloudGazer was created by [Institute of Computer Graphics at Johannes Kepler University Linz](http://www.jku.at/cg/).


## Installation

Follow the steps to install the CloudGazer (Tornado) installation on your Linux system.


### System Package Installations

For these steps sudo rights are required and they will be done outside the virtual environment. (see step 2)

1. Update the Linux system: 
	> sudo apt-get update

2. The following Linux packages are required:
	Debian:
	> sudo apt-get install python-setuptools python-dev python-lxml libxml2-dev libxslt1-dev
           
	Ubuntu:
	> sudo apt-get install python-setuptools python-dev python-lxml libxml2-dev libxslt1-dev zlib1g-dev


### Virtual Environment Setup
It is recommended to create a python virtual environment for running the sink daemon.
Documentation: http://docs.python-guide.org/en/latest/dev/virtualenvs/

1. Create virtual environment
	> sudo apt-get install python-pip
	> sudo pip install virtualenv

2. Create directory for virtual environment
	> virtualenv /dir/to/virtual/env

3. Activate virtual environment
	> cd /dir/to/virtual/env
	> source bin/activate

4. To exit the virtual environment
	> deactivate



### Pipes-vs-Dams Package Installation

Make sure the virtual environment is activated for the following steps, if you want to use it.

1. Go to subfolder `tornado`
	> cd tornado

2. Install the PIPES-VS-DAMS python pages requirements
	> pip install -r requirements.txt

This installation can take a view minutes.


## Run Tornado

Take into account: When the virtual environment is used, run the collectors without sudo rights. The user who starts the processes must have access to all configured data sources (e.g., syslog, accesslog,...).

There are 3 options to run Tornado:

1. For testing run Tornado without environment configuration from the command line
	> cd tornado
	> python main.py -environment=dev -port=8888

	However, it is strongly recommended to create and use an environment configuration file and run Tornado as described in the following two options.

2. Run daemon (with development environment configuration) in background
        > cd tornado
        > python main.py data/<my_use_case>/env.dev.conf &

3. Run daemon (with development environment configuration) in background and write all error messages of the standard output to pvd.log add the suffix "2>&1"
	> cd tornado
	> python main.py data/<my_use_case>/env.dev.conf > logs/pvd.log 2>&1 &

	The suffix `&` starts the python process as background process (to stop it, use the process id of `ps aux | grep python` and `kill <pid>`)

3. Open a web browser and request `localhost:8888` (with default port). As result you should see all available use cases.

In the following section you will learn how to create a new use case and learn more about the different files of a use case.


## Create a New Use Case

The easiest way to create a new CloudGazer use case is to copy everything from `data/example` to `data/<my_use_case>` with `<my_use_case>` as your name. In a second step modify the files as explained in following.

After modifying the use case files you can run Tornado and open the index page in the web browser.


### Use Case Definition (`usecase_config.json`)

Defines the basic configuration of the use case.

**Note:** If you copy the code from here that you have to remove the comments, since they produce an invalid JSON file.

```
{
	// Human-readable use case title
	"title": "My Example Use Case",
	
	// Controller for the JavaScript bootstrap process (optional) 
	"controller": "InfrastructureCtrl",
	
	// URL to template file
	"templateUrl": "uc/<my_use_case>/static_data/<my_use_case>.tpl.html",
	
	// URL to the WebSocket stream
	"socketStream": "<my_use_case>/socket",
	
	// URL to the bookmarks JSON file (optional) 
	"bookmarksFile": "uc/<my_use_case>/static_data/bookmarks.json",
	
	// URL to the traits JSON file
	"traitsFile":"uc/<my_use_case>/static_data/traits.json",
	
	// URL to the infrastructure mapping JSON file (optional) 
	"mappingFile": "uc/<my_use_case>/static_data/mapping.json", 
	
	// List of URLs to the infrastructure JSON file
	"infrastructureFiles": [
		"uc/<my_use_case>/static_data/physical.json",
		"uc/<my_use_case>/static_data/virtual.json",
		"uc/<my_use_case>/static_data/service.json"
	],
	
	// ID of the default infrastructure (from the infrastructure JSON file)
	"defaultInfraId": "p", 
	
	// order of the infrastructure IDs (optional -> use empty array) 
	"mapHierarchyOrder": ["p", "vm", "s"] 
}
```


### Use Case Template (`template.tpl.html`)

Defines the HTML exoskeleton of the use case. It contains PvD components (from Angular directives) as `pvd-*`-Tags and uses Bootstrap for the basic layout.


### Python Back End with Web Socket Handler (`__init__.py`)

Provides a WebSocket handler, wich reads data from a database and sends it as continous stream to the client. Change the name of the registred SocketHandler in the last line. See the file content for detailed documentation.


### Python Run Environment Configuration (`env.dist.conf` and `env.dest.conf`)

Environment configuration file to modify the Tornado run process. The example use case provides a development configuration (`env.dist.conf`) and a distribution configuration (`env.dest.conf`). The configuration file settings override the basic configuration from the `main.py` file and the `usecase/__init__.py` file. For detailed documentation see the content of these files.


### Service and Attribute Definition (`traits.json`)

Defines the collected data sources by the Sink implementation and their used attributes. The file can be seen as interface between the Sink and the Tornado implementation and is used from both parts. You can either create a copy or create a symlink to one or the other file.

**Note:** If you copy the code from here that you have to remove the comments, since they produce an invalid JSON file.

```
{
	// service definition
	"snmpV2": {
		
		// Human-readable service name
		"service": "SNMPv2c Service",
		
		// Node IP address (or unique identifier) where the data was collected
		"nip": {"type": "string", "aggregation_type": "FirstEntryAggregator"},
		
		// Configure the aggregation store (used by Sink only)
		"aggregation_store": ["HourAggregation", "DayAggregation", "WeekAggregation", "MonthAggregation", "YearAggregation"],
		
		// Configure the aggregation delete (used by Sink only)
		"aggregation_delete": {
			"YearAggregation": ["HourAggregation", "DayAggregation", "WeekAggregation"]
		},
		
		// Define the different attributes with data type, min/max and the aggregators
		"attributes": {
			"total_ram": {"type": "float", "min": 0, "max": 8181985, "aggregation_type": "None"},
			"ram_usage": {"type": "float", "min": 0, "max": 8181985, "aggregators": {"mean":"MeanAggregator", "max":"MaxAggregator", "min":"MinAggregator"}, "aggregation_type": "CombiAggregator"},
			
			//... define more attributes here
		}
	}
	// ... define more services here
}
```


### Infrastructure Perspectives (`physical.json`, `virtual.json`, and `service.json`)

Definition of the devices in the network sub-divided in different perspectives. CloudGazer can handle one to multiple perspectives separated in these JSON files and listed in the `usecase_config.json`.

**Note:** If you copy the code from here that you have to remove the comments, since they produce an invalid JSON file.

Each infrastructure perspective JSON file contains the following parts that are described in more detail below the source code.

```
{
	// Human-readable name
	"name": "Physical Perspective",
	
	// Unique infrastructure perspective id
	"id": "p",

	// Color for visualization (e.g., red, green, blue)
	"color": "blue",

	// Version of the perspective (optional, not used so far)
	"version": "0.0.1",

	// A list of Sink oids, to map incoming data to this perspective
	"oids": [ ... ],

	// Definition of devices for this perspective as hierachy (see details below)
	"root": {},

	// Definition of external devices (outside the network) (see details below)
	"external": {},
	
	// Definition of edges between the devices (see details below)
	"edges": [],
	
	// General configuration for the visualization of this perspective
	"visConfig": {
		// Configuration for the representation (see details below)
		"representation": {}
	}
}
```


#### Device Hierarchy Definition (`root`)

Define all devices as nodes for this hierarchy as nested JSON objects. A node is defined by title, alias, and a reference to the attributes defined in the traits file. Each node can contain no or multiple child nodes. Each node gets a `fqname` based on their parents. The `fqname` can be equal across different perspective. For that reason the `fqIname` prefixes the name with the perspective ID. 

**Note:** If you copy the code from here that you have to remove the comments, since they produce an invalid JSON file.

```
"root": {
	// Root node name -> fqname == 'net'
	"name": "net",
	// Children for node `net`
	"children": {
		// child node -> fqname == 'network.net'
		"network": {
			"children": {
				// child node -> fqname == 'gateway.network.net'
				"gateway": {
					// Human-readable title
					"title": "Gateway",
					// alias as lookup for the IP or DNS
					"alias": "10.10.0.1",
					// list of traits with attributes for this node (defined in `traits.json`)
					"traits": ["syslog", "snmpV2"]
				}
			}
		}
		// ... list further nodes
	}
},
```


#### External Definition (`external`)

All devices that are not covered by the own network are _external_ devices. The alias can conver all devices to so that the `root` list of nodes acts like a white list.

**Note:** If you copy the code from here that you have to remove the comments, since they produce an invalid JSON file.

```
"external": {
	// by default all devices are external, except the one listed in `root` (white-listing)
	"aliases": ".*"
},
```

#### Connections in a Hierarchy (`edges`)

Connections between two devices of this perspective are defined as edges.  Each edge consists of a source and a target node name and a list of traits defined in the `traits.json`.

**Note 1:** Connections between devices of different infrastructure perspectives are defined in the `mapping.json`. 

**Note 2:** If you copy the code from here that you have to remove the comments, since they produce an invalid JSON file.

```
"edges": [
	{
		// Name of the source node
		"src": "gateway",
		// Name of the destination node
		"dst": "vmhost1",
		// Directional oder Bidirectional edge
		"bidirectional": true,
		// list of traits with attributes for this node (defined in `traits.json`)
		"traits": ["accesslog"]
	}
	// ... list further edges
},
```

#### Visualization Configuration (`visConfig`)

The appearance of the visualization can be configured for each perspective independently. The `representation` property contains all possible configurations for the node representation. The list of elements of a node is explained in more detail below.

**Note:** If you copy the code from here that you have to remove the comments, since they produce an invalid JSON file.

```
"visConfig": {
	// degree-of-interest (doi) configuration --> used in ThermalPlot
	"doi": {
		"dynamic": {},
		"static": {}
	},
	// list of all representations
	"representation": {
		// name of the representation that can referenced in `template.tpl.html`
		"overview": {
			// representation configuration 
			"config": {
				// list of elements of a node (as shorthand operator)
				"nodeChildren": ["heatmap_inout totalBytes"],
				// mode of the block ("selection-source" or "selection-target")
				"mode": "selection-source",
				// width of each node
				"nodeWidth": 5,
				// height of each element
				"sliceHeight": 5
			}
		},
		//... list further representations
	}
}
```


### Mapping between Perspectives (`mapping.json`)

Definition of the connection between devices of the different perspectives. The mapping is defined as list with both `fqIname` seperated by a dash.

```
[
	"p:vmhost1.network.net-vm:vmhost1.network.net",
	"p:vmhost2.network.net-vm:vmhost2.network.net",

	"vm:vmhost1.network.net-s:vmhost1.network.net",
	"vm:vmhost2.network.net-s:vmhost2.network.net"
]
```

