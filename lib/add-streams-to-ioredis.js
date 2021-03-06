function parseObjectResponse(reply, customParser = null) {
	if (!Array.isArray(reply)) return reply;
	const data = {};
	for (let i = 0; i < reply.length; i += 2) {
		if (customParser) {
			data[reply[i]] = customParser(reply[i], reply[i + 1]);
			continue;
		}
		data[reply[i]] = reply[i + 1];
	}
	return data;
}

function parseMessageResponse(reply) {
	if (!Array.isArray(reply)) return [];
	return reply.map(message => ({ id: message[0], data: parseObjectResponse(message[1]) }));
}

function parseStreamResponse(reply) {
	if (!Array.isArray(reply)) return reply;
	const object = {};
	for (const stream of reply) object[stream[0]] = parseMessageResponse(stream[1]);
	return object;
}

const addCommand = {
	/*
	XRETRY is a custom command to retry stalled out messages

	1)	"1564992161951-0" // Message ID
	2)	"consumerIdx" // Last consumer ID of message
	3)	(integer) 16265 // Last timespan that the message was in pending list
	4)	(integer) 2 // Last delivery count
	5)	"mystream" // Message's stream
	6)	1) "hello" // Array with key-value for message's properties
		2) "world"

	*/
	xretry: target => target.Command.setReplyTransformer('xretry', reply => reply.map((item) => {
		return {
			id: item[0],
			consumerId: item[1],
			idleTime: parseInt(item[2]),
			deliveryCount: parseInt(item[3]),
			stream: item[4],
			data: parseObjectResponse(item[6] || {})
		};
	})),
	xgroup: target => target.Command.setReplyTransformer('xgroup', reply => reply),
	xadd: target => target.Command.setReplyTransformer('xadd', reply => reply),
	xread: target => target.Command.setReplyTransformer('xread', parseStreamResponse),
	xpending: target => target.Command.setReplyTransformer('xpending', (reply) => {
		if (!reply || reply.length === 0) return [];
		if (reply.length === 4 && !isNaN(reply[0])) {
			return {
				count: parseInt(reply[0]),
				minId: reply[1],
				maxId: reply[2],
				consumers: (reply[3] || []).map(consumer => ({
					name: consumer[0],
					count: parseInt(consumer[1]),
				})),
			};
		}
		return reply.map(message => ({
			id: message[0],
			consumerName: message[1],
			elapsedMilliseconds: parseInt(message[2]),
			deliveryCount: parseInt(message[3]),
		}));
	}),
	xreadgroup: target => target.Command.setReplyTransformer('xreadgroup', parseStreamResponse),
	xrange: target => target.Command.setReplyTransformer('xrange', parseMessageResponse),
	xrevrange: target => target.Command.setReplyTransformer('xrevrange', parseMessageResponse),
	xclaim: target => target.Command.setReplyTransformer('xclaim', parseMessageResponse),
	xinfo: target => target.Command.setReplyTransformer('xinfo', reply => parseObjectResponse(reply, (key, value) => {
		switch (key) {
		case 'first-entry':
		case 'last-entry':
			if (!Array.isArray(value)) return value;
			return {
				id: value[0],
				data: parseObjectResponse(value[1]),
			};
		default:
			return value;
		}
	})),
	xack: target => target.Command.setReplyTransformer('xack', reply => parseInt(reply)),
	xlen: target => target.Command.setReplyTransformer('xlen', reply => parseInt(reply)),
	xtrim: target => target.Command.setReplyTransformer('xtrim', reply => parseInt(reply)),
	xdel: target => target.Command.setReplyTransformer('xdel', reply => parseInt(reply)),
};

module.exports = (IORedis = null) => {
	if (IORedis === null) IORedis = require.main.require('ioredis');

	if (IORedis._hasSupportForStream) return undefined;

	IORedis._hasSupportForStream = true;

	Object.keys(addCommand).forEach((command) => {
		const { string, buffer } = IORedis.prototype.createBuiltinCommand(command);
		IORedis.prototype[command] = string;
		IORedis.prototype[`${command}Buffer`] = buffer;
		addCommand[command](IORedis);
	});
};
