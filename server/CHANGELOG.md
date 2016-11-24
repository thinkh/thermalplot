Changelog
=============

This changelog reflects only the changes on CloudGazer.
You can see the current version of CloudGazer and Sinks in the `/server/version.cfg` file.

## 1.3.4

- Traits Handling: The definition in the traits.json can be overriden by the one in the infrastructure.json (before the infrastructure.json was ignored if a traits.json was given)
- 


## 1.3.3

- Added "bulk load and jump" to CloudGazer timeline
- Added latency buffer option to __init__.py


## 1.3.2

- Added NumberCalcAttribute that solves a given formula dynamically by using references to other attribute values (in traits.json -> 'type': 'float_calc')


## 1.3.1

- Improved documentation
- Updated the example use case
- Fixed security issues


## 1.3.0

- CloudGazer can add nodes dynamically by sending an internal `addNode` message to client


## 1.2.1

- ThermalPlot improvements
	- Bugfix for using non-uniform scale in DOIStreamgraph
	- Bugfix in ThermalLayout to set dimensions to physics layer on resize
	- Improved attributes names of DOIStreamgraph tooltip


## 1.2.0
- Updated Font Awesome icons and use them now via bower
- Show abbr. weekday in tooltip
- ThermalPlot improvements
	- Added jumpTo attributes to StockTimeline directive
	- Added modal dialog for none chrome browser
	- Missing values indicator
	- Time axis for detail view


## 1.1.0

- Changed highlight color
- ThermalPlot improvements
	-New DoI editor layout including inverted attributes
	- New use case with OECD interest rate data set
	- Reduced options in options panel


## 1.0.1

- New setup routine
- Added readme


## 1.0.0

- Initial release
