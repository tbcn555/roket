var doodle = (function() {
    Function.prototype.bind = Function.prototype.bind || function(fixThis) {
        var func = this;
        return function() { return func.apply(fixThis, arguments); };
    };

    var PI_half = Math.PI / 2;
    var resources = {};

    // -------- Stage --------
    var Stage = function(canvas, opts) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.objects = [];
        this.restart_timeout = 1000;
        this.paused = false;
        this.destroyed = false;
        this.opts = opts || {};
        return this;
    };

    Stage.prototype.frame = function() {
        if (this.destroyed) return;
        var ctx = this.ctx;
        ctx.clearRect(0,0,ctx.canvas.width, ctx.canvas.height);

        for (var i=0;i<this.objects.length;i++) {
            var obj = this.objects[i];
            if (obj.destroyed) {
                this.objects.splice(i,1);
                i--;
            } else {
                obj.tick(ctx);
            }
        }

        if (this.objects.length === 0) {
            var self = this;
            setTimeout(function(){
                self.setup();
                requestAnimationFrame(self.frame.bind(self));
            }, this.restart_timeout);
        } else if (!this.paused) {
            requestAnimationFrame(this.frame.bind(this));
        }
    };

    Stage.prototype.setup = function() {
        this.objects.push(getFormation(this, this.opts));
    };

    Stage.prototype.destroy = function() {
        this.destroyed = true;
        this.objects = [];
    };

    // -------- Formation --------
    var Formation = function(x,y,count) {
        this.x = x;
        this.y = y;
        this.planes = [];
        this.count = count || 5;
    };

    Formation.prototype.addPlane = function(fx, fy, color, img) {
        var px = this.x + fx, py = this.y + fy;
        var plane = new Rocket(img, px, py, color, fx, fy);
        this.planes.push(plane);
        return plane;
    };

    Formation.prototype.travelTo = function(x,y,vRange) {
        for (var i=0;i<this.planes.length;i++) {
            var p = this.planes[i];
            var v = vRange ? (vRange[0] + Math.random()*(vRange[1]-vRange[0])) : (3+Math.random()*2);
            p.travelTo(p.formation_x + x, p.formation_y + y, v);
        }
    };

    Formation.prototype.tick = function(ctx) {
        for (var i=0;i<this.planes.length;i++) {
            var p = this.planes[i];
            if (p.destroyed) {
                this.planes.splice(i,1);
                i--;
            } else p.tick(ctx);
        }
        if (this.planes.length===0) this.destroy();
    };

    Formation.prototype.destroy = function() { this.destroyed = true; };

    // -------- Helpers --------
    function choosePoint(side, canvas) {
        var w = canvas.width, h = canvas.height;
        if (!side) side = 'random';
        if (typeof side === 'object') return side;
        if (side === 'random') {
            var r = Math.random();
            if (r<0.25) side='left'; else if (r<0.5) side='right';
            else if (r<0.75) side='top'; else side='bottom';
        }
        switch(side) {
            case 'left': return {x:-50, y:h*Math.random()};
            case 'right': return {x:w+50, y:h*Math.random()};
            case 'top': return {x:w*Math.random(), y:-50};
            case 'bottom': return {x:w*Math.random(), y:h+50};
            case 'center': return {x:w/2,y:h/2};
            default: return {x:w/2,y:h/2};
        }
    }
    function oppositeOf(side) {
        if (typeof side==='object') return null;
        switch(side) {
            case 'left': return 'right';
            case 'right': return 'left';
            case 'top': return 'bottom';
            case 'bottom': return 'top';
            case 'center': return 'random';
            default: return 'random';
        }
    }

    var getFormation = function(stage, opts) {
        opts = opts || {};
        var canvas = stage.ctx.canvas;
        var startSpec = opts.start || 'random';
        var endSpec = opts.end || oppositeOf(startSpec);
        var count = opts.count || 5;
        var spacing = opts.spacing || 40;
        var img = resources.rocket_img;

        var startPoint = choosePoint(startSpec, canvas);
        var endPoint = (typeof endSpec==='object') ? endSpec : choosePoint(endSpec, canvas);

        var formation = new Formation(startPoint.x, startPoint.y, count);

        var totalWidth = (count-1)*spacing;
        var leftMost = -totalWidth/2;
        for (var i=0;i<count;i++) {
            var fx = leftMost + i*spacing;
            var fy = (i%2===0)?0:10;
            var color = Math.floor(100+Math.random()*155)+","+
                        Math.floor(100+Math.random()*155)+","+
                        Math.floor(100+Math.random()*155);
            formation.addPlane(fx, fy, color, img);
        }

        var dx = endPoint.x - startPoint.x;
        var dy = endPoint.y - startPoint.y;
        formation.travelTo(dx, dy, opts.speedRange||[3,6]);
        return formation;
    };

    // -------- Rocket --------
    var Rocket = function(img, initX, initY, smoke_rgb, fx, fy) {
        this.img = img;
        this.x = initX; this.y = initY;
        this.formation_x = fx; this.formation_y = fy;
        this.smoke_particles_list = [];
        this.smoke_rgb = smoke_rgb;
        this.destroy_plane = false;
        this.pather = new PathMaker();
    };

    Rocket.prototype.draw = function(ctx) {
        ctx.save();
        var angle = Math.atan(this.pather.slope) + PI_half;
        ctx.translate(this.x,this.y);
        ctx.rotate(angle);
        if (this.img && this.img.width) {
            ctx.drawImage(this.img, -this.img.width/2, -this.img.height/2);
        } else {
            drawFallbackRocket(ctx);
        }
        ctx.restore();

        for (var i=0;i<this.smoke_particles_list.length;i++) {
            var s = this.smoke_particles_list[i];
            if (s.destroyed) {
                this.smoke_particles_list.splice(i,1);
                i--;
            } else s.draw(ctx);
        }
    };

    Rocket.prototype.travelTo = function(x,y,v) {
        this.pather.createPath(this.x,this.y,this.x+x,this.y+y,v);
    };

    Rocket.prototype.tick = function(ctx) {
        this.pather.move();
        var angle = Math.atan(this.pather.slope) + PI_half;
        var adj_x = -this.formation_x + this.formation_x*Math.cos(angle) - this.formation_y*Math.sin(angle);
        var adj_y = -this.formation_y + this.formation_x*Math.sin(angle) + this.formation_y*Math.cos(angle);
        this.x = this.pather.x + adj_x;
        this.y = this.pather.y + adj_y;

        if (this.smoke_particles_list.length<100 && !this.destroy_plane) {
            var dx = (6+2*Math.random())*Math.cos(angle) - (28+6*Math.random())*Math.sin(angle);
            var dy = (6+2*Math.random())*Math.sin(angle) + (28+6*Math.random())*Math.cos(angle);
            this.smoke_particles_list.push(new SmokeParticle(this.x+dx,this.y+dy,this.smoke_rgb));
        }

        this.draw(ctx);

        var bbw=80;
        if (this.x>ctx.canvas.width+bbw||this.y>ctx.canvas.height+bbw||this.x<-bbw||this.y<-bbw)
            this.destroy_plane=true; else this.destroy_plane=false;

        if (this.destroy_plane && this.smoke_particles_list.length===0) this.destroy();
    };

    Rocket.prototype.destroy = function(){ this.destroyed=true; };

    // -------- PathMaker --------
    var PathMaker = function() {
        this.speed=2.5; this.slope=0;
        this.x=0; this.y=0; this.dirx=0; this.diry=0;
    };
    PathMaker.prototype.createPath = function(x1,y1,x2,y2,v) {
        this.x=x1; this.y=y1;
        var dx=x2-x1, dy=y2-y1;
        this.slope = dx===0 ? (dy>0?1e6:-1e6):(dy/dx);
        this.speed=v||this.speed;
        var d=Math.sqrt(dx*dx+dy*dy);
        this.dirx=dx/d; this.diry=dy/d;
    };
    PathMaker.prototype.move = function(){ this.x+=this.dirx*this.speed; this.y+=this.diry*this.speed; };

    // -------- Smoke --------
    var SmokeParticle=function(x,y,rgb){
        this.x=x; this.y=y; this.opacity=0.5;
        this.radius=2+Math.random()*2; this.rgb=rgb||"200,200,200";
    };
    SmokeParticle.prototype.draw=function(ctx){
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle='rgba('+this.rgb+','+this.opacity+')';
        ctx.arc(this.x,this.y,this.radius,0,Math.PI*2,true);
        ctx.fill();
        this.radius+=0.06; this.opacity-=0.006;
        if (this.opacity<=0) this.destroyed=true;
        ctx.restore();
    };

    function drawFallbackRocket(ctx){
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0,-18); ctx.lineTo(10,12); ctx.lineTo(0,6); ctx.lineTo(-10,12); ctx.closePath();
        ctx.fillStyle="#c33"; ctx.fill();
        ctx.beginPath(); ctx.arc(0,-6,3,0,Math.PI*2); ctx.fillStyle="#88d"; ctx.fill();
        ctx.restore();
    }

    // -------- Public --------
    var stage;
    function init(imgSrc,options){
        var canvas=document.createElement('canvas');
        canvas.id="canvas_doodle";
        canvas.height=window.innerHeight;
        canvas.width=window.innerWidth;
        canvas.style.position="fixed";
        canvas.style.top=0; canvas.style.left=0;
        canvas.style.zIndex=1138; canvas.style.pointerEvents="none";
        document.body.appendChild(canvas);
        stage=new Stage(canvas,options||{});
        resources.rocket_img=new Image();
        resources.rocket_img.src=imgSrc||"";
        resources.rocket_img.onload=function(){
            stage.setup(); requestAnimationFrame(stage.frame.bind(stage));
        };
        resources.rocket_img.onerror=function(){
            stage.setup(); requestAnimationFrame(stage.frame.bind(stage));
        };
        window.addEventListener('resize',function(){
            canvas.height=window.innerHeight;
            canvas.width=window.innerWidth;
        });
    }
    function destroy(){
        if(!stage) return;
        stage.destroy();
        var el=document.getElementById("canvas_doodle");
        if(el) setTimeout(function(){document.body.removeChild(el)},50);
        stage=null;
    }
    return { init:init, destroy:destroy };
})();
