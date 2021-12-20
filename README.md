# node-red-contrib-ui-reef

[![platform](https://img.shields.io/badge/platform-Node--RED-red)](https://nodered.org)


This set of Node-Red nodes are inteded to be used to create an interactive dashboard for reef and freshwater aquarium controllers.  Node-Red-Dashboard (min v2.10.0) is required and must be installed first.

![image](https://user-images.githubusercontent.com/45469378/146694931-4b29cefe-bff7-48d8-b2ff-3cca6dedfff5.png)

## Install

Either use the Manage Palette option in the Node-RED Editor menu, or run the following command in your Node-RED user directory - typically `~/.node-red`

```javascript
npm install node-red-contrib-ui-reef
```

## Probe

![image](https://user-images.githubusercontent.com/45469378/146694968-1ff84c32-0ac8-4483-bc17-e7087a5569cc.png)

Probe accepts two types of data, live data or stored data.  Live data can be fed via `msg.payload` or stored data via an array of objects with an `x` and `y` property:

Live data:
```javascript
msg = { payload: 8.15 }
```

Stored data:
```javascript
[
    { x: 1520527095000, y: 8.15 },
    { x: 1520934095000, y: 8.17 }
]
```

When providing data for the time scale, this node uses timestamps defined as milliseconds since the epoch (midnight January 1, 1970, UTC) internally. However, it will also accept most datetime formats by way of the included chartjs-adapter-moment plugin.  

Value on the right will show most recent datapoint whether that be live data or stored data.  If a symbol is specified it will be appended to this value only.  Regardless of iput data, the time component will be validated against the specified timeframe and older values dropped.  Additionally, there are options to round values to a specific decimal place and/or map value(s) to a range.

## Output

![image](https://user-images.githubusercontent.com/45469378/146694977-60294bd5-ef14-4466-bfb1-3784107c5538.png)

Output node is a highly modified fork of [node-red-contrib-ui-multistate-switch](https://github.com/bartbutenaers/node-red-contrib-ui-multistate-switch) and the Node-Red Function node.  In essence, it provides a switch option to run a function on interval instead of on incoming `msg`.  Function runs initially when the switch is set to the function option then repeats on the specified interval.  Changing switch position to any other option will cancel the interval and send static value associated with selected option.  

Incoming messages which have a valid `topic` and `payload` will be stored in the node's context for use in the function.  If `msg.toFront` exists in an input or output message the value will be sent to the front to be displayed in the upper-right hand of widget.

The "Restore" option will load switch state from context on Node-red restart if Node-red context settings specify "localfilestorage".  

## Input

![image](https://user-images.githubusercontent.com/45469378/146695082-7d691a09-d58b-4a04-9737-af2f5fafc4c8.png)

Input node is a modified fork of [node-red-contrib-ui-multistate-switch](https://github.com/bartbutenaers/node-red-contrib-ui-multistate-switch) which sets switch based on input value.  Color option allows specific colors to be set for different switch positions. 

## Important Note

These nodes would not be possible without the work of the following:

* [barbutenaers](https://github.com/barbutenaers) / [hotnipi](https://github.com/hotNipi) - [node-red-contrib-ui-multistate-switch](https://github.com/bartbutenaers/node-red-contrib-ui-multistate-switch)
* Node-Red Team - Function node
* Node-Red-Dashboard Team - Chart node