# ThermalPlot

ThermalPlot is a technique to visualize multi-attribute time-series data using a thermal metaphor.

![ThermalPlot screenshot](http://thermalplot.pipes-vs-dams.at/images/card_image.png)


## Prerequisites

Install [VirtualBox](https://www.virtualbox.org/) and [Vagrant](https://www.vagrantup.com/).


## Installation

1. Clone this repository
2. Open your terminal or command line
   Note for Windows user: open command line as Administrator!
3. Run `cd your_repo_directory/vagrant && vagrant up` to create and boot the VM
4. After the first part of the installation has been finished, run `vagrant ssh` to connect to the VM
5. After connected to the VM run `cd /vagrant/`
6. Provision the VM: On Windows run `sh provision.sh true`. On Mac/Linux run `sh provision.sh false` 
7. Wait until the initial client-side build has finished 
8. The setup will switch to the server directory and start the server automatically
9. Open a web browser and go to http://localhost:8888


## Update default finance dataset

The default fincance dataset is importing data of the [FTSE 250](http://www.londonstockexchange.com/exchange/prices-and-markets/stocks/indices/summary/summary-indices.html?index=MCX) index.

1. Start VM (`vagrant up`) and connect to VM (`vagrant ssh`)
2. Run update script: `cd /var/server/data/thermal_ftse250/csv && sh update_sqlite.sh`


## Start server

1. Start VM (`vagrant up`) and connect to VM (`vagrant ssh`)
2. Run: `cd /var/server && python main.py -config=env.vagrant_serve.conf` 

