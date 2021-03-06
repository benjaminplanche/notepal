var JupiterOp = require('./module.jupiterOp').JupiterOp;
var logger = require ('../logger');

/**
 * =================
 * CLASS - JupiterNode
 * 		by Benjamin (Bill) Planche / Aldream 
 * =================
 * Defines a general node (client or server) in the Jupiter system.
 * The node can generate local changes on the shared data and send messages to inform other nodes, and received  
 */

module.exports = function(localServices) {

	/**
	 * JupiterNode (Constructor)
	 * ====
	 * Parameters:
	 *	- id (int):									ID of the node in the system
	 *	- data (string):							Copy of the shared data manipulated by the node
	 * 	- sendOp (Function(ID, JSONObject, ID)):	Method to use to send operations
	 * Output: Instance of JupiterNode
	 */
	function JupiterNode(id, data, sendOp) {
		// Attributes:
		this.id = id;				// int 				- ID of the node in the system
		this.data = data;			// string 			- Data manipulated by the node
		this.nodeMessages = [];		// Array of int		- Number of messages generated
		this.otherMessages = [];	// Array of int		- Number of messages received
		this.outgoing = [];			// Array of queue	- Queue of the local operations not yet acknowledged by the server
		this.sendOp = sendOp;		// Function			- Method to use to send operations
	}
	
	/**
	 * addClient
	 * ====
	 * Parameters:
	 *	- id (int):			ID of the client node
	 * Output: /
	 */
	JupiterNode.prototype.addClient = function(id) {
		// Data related to this new client:
		this.nodeMessages[id] = 0;
		this.otherMessages[id] = 0;
		this.outgoing[id] = [];
	}
	
	/**
	 * removeClient
	 * ====
	 * Parameters:
	 *	- id (int):			ID of the client node
	 * Output: /
	 */
	JupiterNode.prototype.removeClient = function(id) {
		// Data related to this new client:
		delete this.nodeMessages[id];
		delete this.otherMessages[id];
		delete this.outgoing[id];
	}

	/**
	 * generate
	 * ====
	 * Applies a local operation and send a message to inform the system in order to propagate it.
	 * Parameters:
	 *	- msg (JSON Object):	Local operation to apply and send
	 * Output: /
	 */
	JupiterNode.prototype.generate = function(idClient, msg, idInitiator)
	{
		msg.nMes = this.nodeMessages[idClient];
		msg.oMes = this.otherMessages[idClient];

		// Sending the operation to inform the corresponding client:
		this.sendOp(idClient, msg, idInitiator);
		
		// Adding it to the list of unacknowledged operations:
		if (!msg.isPseudo) this.nodeMessages[idClient]++;
		else delete msg.isPseudo;
		
		this.outgoing[idClient].push(msg);
	};

	/**
	 * receive
	 * ====
	 * Applies an operation received from another node.
	 * Potential conflicts with unacknowledged local operations are handled by applying the Transformation Rules.
	 * Parameters:
	 *	- msg ({num: int, op: Operation}):	Message from another node to apply on the local version.
	 * Output: /
	 */
	JupiterNode.prototype.receive = function(socket, msg)
	{
		var jupiterServerNode = this;

		// TODO: if (this.otherMessages != msg.num) throw ERROR
		
		// Discarding acknowledged messages:
		while (this.outgoing[socket.id].length > 0 && this.outgoing[socket.id][0].nMes < msg.oMes) {
			this.outgoing[socket.id].shift();
		}
		
		// Transforming the incoming operations and the one in the queue:
		for (var i=0; i < this.outgoing[socket.id].length; i++) {
			JupiterOp.xform(msg, this.outgoing[socket.id][i]);
			if (msg.pseudoOp) {
					this.receive(socket, msg.pseudoOp);
			}
		}
		
		
		var pseudoOpQueue = [];
		msg = applyXformRecursive(0, msg, this.outgoing, pseudoOpQueue);
		
		// We first apply the potential pseudo operations then the original one:
			
		var recursiveSaveAndApplyAll = function() {
			if (pseudoOpQueue.length) {
				localServices.saveOperation({idUser : 'TO DO', type: pseudoOpQueue[0].op, param: pseudoOpQueue[0].param /*, timestamp: TO DO*/}, function(op, suc) {
					if (suc) {
						applyAndPropagateOperation(pseudoOpQueue.shift(), socket);
						hop();
					}
				});
			}
			else {
				localServices.saveOperation({idUser : 'TO DO', type: msg.op, param: msg.param /*, timestamp: TO DO*/}, function(op, suc) {
					applyAndPropagateOperation(msg, socket);
					jupiterServerNode.otherMessages[socket.id]++;
				});
			}
		};
		recursiveSaveAndApplyAll();
		
		return msg;
		
		/*
		localServices.saveOperation({idUser : 'TO DO', type: msg.op, param: msg.param , timestamp: TO DO}, function(op, suc) {	
			if (suc) { // If the operation was safely saved:

				// Applying the operation locally:
				jupiterServerNode.data = JupiterOp.apply(jupiterServerNode.data, msg);
				jupiterServerNode.otherMessages[socket.id]++;

				// Synchronizing with all the other clients:
				var clients = jupiterServerNode.io.sockets.clients();
				for (var i = 0; i < clients.length; i++) {
					if (clients[i].id != socket.id) {
						jupiterServerNode.generate(clients[i], msg);
					}
				}

				// Saving the effects of the operation in the DB:
				if (msg.op == 'cIns' || msg.op == 'cDel' || msg.op == 'sIns' || msg.op == 'sDel') { // Edition of the text of a note
					localServices.updateNoteText(msg.param.id, jupiterServerNode.data[msg.param.id].text);
				}
				else if (msg.op == 'nAdd') { // Creation of a note
					localServices.saveNote(msg.param.id, jupiterServerNode.data[msg.param.id], function(){});
				}
				else if (msg.op == 'nDel') { // Deletion of a note
					localServices.updateNoteState(msg.param.id, 0);
				}
				else if (msg.op == 'nDrag') { // Moving a note
					localServices.updateNoteDrag(msg.param.id, jupiterServerNode.data[msg.param.id].x, jupiterServerNode.data[msg.param.id].y);
				}
			}
		});
		*/
		
		function applyXformRecursive(k, msg, outgoing, opQueue) {
			// Transforming the incoming operations and the one in the queue:
			for (var i=k; i < outgoing.length; i++) {
				JupiterOp.xform(msg, outgoing[i]);
				if (msg.pseudoOp) {
					msg.pseudoOp.isPseudo = true;
					opQueue.push(applyXformRecursive(i+1, clone(msg.pseudoOp), outgoing, opQueue));
					delete msg.pseudoOp;
				}
			}
			
			return msg;
		}
		
		function applyAndPropagateOperation(msg, socket) {
			// Applying the operation locally:
			jupiterServerNode.data = JupiterOp.apply(jupiterServerNode.data, msg);

			// Synchronizing with all the other clients:=
			for (var idClient in jupiterServerNode.nodeMessages) {
				if (idClient != socket.id) {
					jupiterServerNode.generate(idClient, msg, socket.id);
				}
			}

			// Saving the effects of the operation in the DB:
			if (msg.op == 'cIns' || msg.op == 'cDel' || msg.op == 'sIns' || msg.op == 'sDel') { // Edition of the text of a note
				localServices.updateNoteText(msg.param.id, jupiterServerNode.data[msg.param.id].text);
			}
			else if (msg.op == 'nAdd') { // Creation of a note
				localServices.saveNote(msg.param.id, jupiterServerNode.data[msg.param.id], function(){});
			}
			else if (msg.op == 'nDel') { // Deletion of a note
				localServices.updateNoteState(msg.param.id, 0);
			}
			else if (msg.op == 'nDrag') { // Moving a note
				localServices.updateNoteDrag(msg.param.id, jupiterServerNode.data[msg.param.id].x, jupiterServerNode.data[msg.param.id].y);
			}
			jupiterServerNode.data[msg.param.id].timestampLastOp = new Date();
		}
	};

	function clone(obj) {
		// Handle the 3 simple types, and null or undefined
		if (null == obj || "object" != typeof obj) return obj;

		// Handle Date
		if (obj instanceof Date) {
			var copy = new Date();
			copy.setTime(obj.getTime());
			return copy;
		}

		// Handle Array
		if (obj instanceof Array) {
			var copy = [];
			for (var i = 0, len = obj.length; i < len; i++) {
				copy[i] = clone(obj[i]);
			}
			return copy;
		}

		// Handle Object
		if (obj instanceof Object) {
			var copy = {};
			for (var attr in obj) {
				if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
			}
			return copy;
		}

		throw new Error("Unable to copy obj! Its type isn't supported.");
	}

	return JupiterNode;
}
