var locationHelper = (function () {
	/**
	 * CustomEvent polyfill
	 * @see https://developer.mozilla.org/ru/docs/Web/API/CustomEvent/CustomEvent
	 */
	var CustomEvent = window.CustomEvent;
	if (typeof CustomEvent !== 'function') {
		CustomEvent = function (event, params) {
			params = params || { bubbles: false, cancelable: false, detail: undefined };
			var evt = document.createEvent('CustomEvent');
			evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
			return evt;
		}
		CustomEvent.prototype = window.Event.prototype;
	}
	
	function LocationHelper() {
		var prevChange = null;
		
		this.trigger = function (type, detail) {
			document.dispatchEvent(new CustomEvent(type, {
				detail: detail,
				bubbles: true,
				cancelable: false,
			}));
			
			if (type == 'location-change') {
				// trigger relative sub-events:
				if (!prevChange || prevChange.parts.path != detail.parts.path) {
					this.trigger('location-change-path', {
						href: detail.href,
						parts: detail.parts,
						prevPath: prevChange ? prevChange.parts.path : null,
						path: detail.parts.path,
					});
				}
				if (!prevChange || prevChange.parts.search != detail.parts.search) {
					this.trigger('location-change-search', {
						href: detail.href,
						parts: detail.parts,
						prevSearch: prevChange ? prevChange.parts.search : null,
						search: detail.parts.search,
					});
				}
				if (!prevChange || prevChange.parts.hash != detail.parts.hash) {
					this.trigger('location-change-hash', {
						href: detail.href,
						parts: detail.parts,
						prevHash: prevChange ? prevChange.parts.hash : null,
						hash: detail.parts.hash,
					});
				}
				
				prevChange = JSON.parse(JSON.stringify({
					href: detail.href,
					parts: detail.parts,
				}));
			}
		};
	}
	
	LocationHelper.prototype.parseParams = function (s) {
		var res = {};
		s = s.split('&');
		var param;
		for (var i = 0; i < s.length; i++) {
			if (!s[i])
				continue;
			param = s[i].split('=', 2);
			LocationHelper.setValueByPath(res, param[0], param.length > 1 ? param[1] : true);
		}
		LocationHelper.walkObjectTree(res, function (value, key, parent) {
			if (typeof value != 'object')
				return value;
			var arr = LocationHelper.isArray(value);
			return arr || value;
		});
		return res;
	};
	
	LocationHelper.setValueByPath = function (o, path, value) {
		if (!(path instanceof Array)) {
			path = path.replace(/^([^\[]+)/, '[$1]');
			path = path.slice(1, -1).split('][');
		}
		if (typeof value == 'string') {
			value = value == '%0' ? null : decodeURIComponent(value);
		}
		
		var name = path.pop();
		var res = o;
		var dir = false;
		while (path.length > 0) {
			dir = decodeURIComponent(path.shift());
			
			if (dir === '') {
				if (o[dir] && !(o[dir] instanceof Array))
					o[dir] = [];
			}
			else if (typeof o[dir] != 'object' || !o[dir]) {
				o[dir] = {};
			}
			
			if (path.length) {
				o = o[dir];
			}
		}
		
		if (name === '') {
			if (dir !== false && !(o[dir] instanceof Array))
				o[dir] = [];
			if (dir !== false) {
				var v = o[dir];
				delete o[dir];
				o[dir] = v;
				o = o[dir];
			}
			if (value !== null)
				o.push(value);
		}
		else {
			if (dir !== false)
				o = o[dir];
			delete o[name];
			if (value !== null)
				o[name] = value;
		}
		
		return o;
	};
	
	LocationHelper.isArray = function (o) {
		if (o instanceof Array)
			return o;
		if (typeof o != 'object' || !o)
			return false;
		var re = /^\d+$/;
		var arr = [];
		for (var k in o) {
			if (k == 'length')
				continue;
			if (!re.test(k))
				return false;
			arr[k] = o[k];
		}
		return arr;
	};
	
	LocationHelper.walkObjectTree = function (o, cb) {
		if (typeof o != 'object' || !o)
			return o;
		for (var k in o) {
			o[k] = cb(o[k], k, o);
			if (typeof o == 'object' && o) {
				this.walkObjectTree(o[k], cb);
			}
		}
		return o;
	};
	
	var parseURLRegExp = /^(?:(https?|file|[a-z]+):\/\/(?:([^\/:]+)(?::(\d+))?|))?(\/[^?#]*)?(\/?[^#]*)?(#\S*)?/;
	
	LocationHelper.prototype.parseURL = function (url) {
		var res = parseURLRegExp.exec(url);
		if (!res)
			return false;
		res = {
			schema: res[1],
			protocol: res[1] && res[1] + ':' || res[1],
			host: res[2],
			port: res[3],
			path: res[4],
			search: res[5],
			hash: res[6],
		};
		
		return res;
	};
	
	LocationHelper.prototype.buildURL = function (parts, baseParts) {
		if (!parts.protocol || parts.schema)
			parts.protocol = parts.schema + ':';
		else if (parts.protocol || !parts.schema)
			parts.schema = parts.protocol.slice(0, -1);
		
		if (baseParts) {
			if (!parts.protocol || !parts.host || !parts.port) {
				parts.protocol = baseParts.protocol;
				parts.schema = baseParts.schema;
				parts.host = baseParts.host;
				parts.port = baseParts.port;
			}
			if (!parts.path) {
				parts.path = baseParts.path;
			}
			if (parts.hash) {
				var newHash = parts.hash.split('!', 2);
				if (newHash.length < 2)
					newHash[1] = '';
				newHash[0] = newHash[0].length > 1 ? newHash[0] : (baseParts.hash && baseParts.hash.split('!')[0] || '');
				if (typeof newHash[1] == 'undefined') {
					newHash[1] = baseParts.hash && baseParts.hash.split('!')[1] || '';
				}
				else if (newHash[1][0] == '&') {
					newHash[1] = newHash[1].substr(1).split('&');
					var currentHashParams = this.getHashParams();
					for (var i = 0; i < newHash[1].length; i++) {
						var s = newHash[1][i].split('=', 2);
						LocationHelper.setValueByPath(currentHashParams, s[0], s[1]);
					}
					newHash[1] = this.buildParams(currentHashParams);
				}
				if (!newHash[1])
					newHash = [ newHash[0] ];
				if (newHash[1] && !newHash[0])
					newHash[0] = '#';
				parts.hash = newHash[0] == '#' && !newHash[1] ? '' : newHash.join('!');
			}
		}
		
		var s = [
			parts.path || '',
			parts.search || '',
			parts.hash || '',
		];
		
		if (parts.protocol == 'file:') {
			s.unshift(parts.protocol + '//');
		}
		else if (parts.host && parts.protocol) {
			if (parts.port)
				s.unshift(':' + parts.port);
			s.unshift(parts.host);
			s.unshift(parts.protocol + '//');
		}
		
		return s.join('');
	};
	
	LocationHelper.prototype.buildParams = function (o, parent) {
		if (typeof o == 'undefined' || o === null)
			return '';
		if (typeof o != 'object')
			return parent + '=' + encodeURIComponent(o);
		
		var s = [];
		if (o instanceof Array) {
			var prevDefinedI = -1;
			for (var i = 0; i < o.length; i++) {
				var v = o[i];
				if (typeof v == 'undefined' || v === null)
					continue;
				var path = parent ? parent + '[' : '[';
				if (i - prevDefinedI > 1)
					path += i;
				path += ']';
				s.push(this.buildParams(v, path));
				prevDefinedI = i;
			}
		}
		else {
			for (var k in o) {
				var v = o[k];
				if (typeof v == 'undefined' || v === null)
					continue;
				var path = parent ? parent + '[' + encodeURIComponent(k) + ']' : encodeURIComponent(k);
				s.push(this.buildParams(v, path));
			}
		}
		return s.join('&');
	};
	
	LocationHelper.prototype.getHref = function () {
		return document.location.href;
	};
	
	LocationHelper.prototype.getHash = function () {
		return document.location.hash;
	};
	
	LocationHelper.prototype.getSearch = function () {
		return document.location.search;
	};
	
	LocationHelper.prototype.getPath = function () {
		return document.location.pathname;
	};
	
	LocationHelper.prototype.getHashParams = function () {
		var s = this.getHash();
		return this.parseParams(s.split('!', 2)[1] || '');
	};
	
	LocationHelper.prototype.getSearchParams = function () {
		var s = this.getSearch();
		return this.parseParams(s.slice(1));
	};
	
	LocationHelper.prototype.setLocation = function (hrefOrParts, replace, originalEvent) {
		var parts = typeof hrefOrParts == 'object' ? hrefOrParts : this.parseURL(hrefOrParts);
		var curParts = this.parseURL(this.getHref());
		var href = this.buildURL(parts, curParts);
		
		history[replace ? 'replaceState' : 'pushState']({
			href: href,
			parts: parts,
		}, '', href);
		
		this.trigger('location-change', {
			href: href,
			parts: parts,
			originalEvent: originalEvent,
		});
		
		return this;
	};
	
	LocationHelper.prototype.reload = function (originalEvent) {
		var href = this.getHref();
		var parts = this.parseURL(href);
		
		history['replaceState']({
			href: href,
			parts: parts,
		}, '', href);
		
		this.trigger('location-change', {
			href: href,
			parts: parts,
			originalEvent: originalEvent,
		});
		
		return this;
	};
	
	var bindParams = false;
	
	LocationHelper.prototype.bind = function (_bindParams) {
		_bindParams = _bindParams || true;
		if (!history || !history.pushState)
			return this;
		
		if (bindParams) {
			bindParams = _bindParams;
			return this;
		}
		bindParams = _bindParams;
		
		this.setLocation(document.location.href, true);
		var _this = this;
		
		window.addEventListener('popstate', function (event) {
			if (!event.state || !event.state.href || !event.state.parts)
				return;
			_this.trigger('location-change', {
				href: event.state.href,
				parts: event.state.parts,
				originalEvent: event,
			});
		}, false);
		
		document.body.addEventListener('click', function (event) {
			var a = event.target;
			while (a && a.nodeName != 'A')
				a = a.parentElement;
			if (a && a.target == '_null') {
				event.preventDefault();
				return false;
			}
			if (!a || !a.href || (a.target || '_self') != '_self')
				return;
			
			var parts = _this.parseURL(a.href);
			if (!parts || !/^https?:/.test(parts.protocol))
				return;
			
			var curParts = _this.parseURL(_this.getHref());
			if (parts.host != curParts.host || parts.protocol != curParts.protocol || parts.port != curParts.port)
				return;
			
			if (bindParams !== true && bindParams.path && curParts.path != parts.path)
				return;
			if (bindParams !== true && bindParams.search && curParts.search != parts.search)
				return;
			if (bindParams !== true && bindParams.hash && curParts.hash != parts.hash)
				return;
			
			_this.setLocation(parts, false, event);
			
			event.preventDefault();
		}, false);
		
		return this;
	}
	
	return new LocationHelper();
})();
