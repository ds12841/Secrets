require('dotenv').config();
const express = require('express');
const bp = require('body-parser');
const ejs = require('ejs');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require("passport");
const passportLocalMongoose = require('passport-local-mongoose');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const findOrCreate = require('mongoose-findorcreate')
const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const app = express();
//const cryptoRandomString = require('crypto-random-string');

app.set('view engine', 'ejs');

app.use(bp.urlencoded({
    extended: true
}));
app.use(express.static('public'));

app.use(session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());


mongoose.connect("mongodb://localhost:27017/userDB", {
    useNewUrlParser: true,
    useUnifiedTopology: true
});
mongoose.set('useCreateIndex', true);
const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    googleId: String,
    facebookId: String,
    secret: [{}],
    key: String
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate)

const User = new mongoose.model('user', userSchema);

passport.use(User.createStrategy())
passport.serializeUser(function(user, done) {
    done(null, user.id);
  });
  
  passport.deserializeUser(function(id, done) {
    User.findById(id, function(err, user) {
      done(err, user);
    });
  });

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/secrets",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
      console.log(profile);
      User.findOrCreate({username:profile.displayName, googleId: profile.id }, function (err, user) {
        return cb(err, user);
    });
  }
));
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: "http://localhost:3000/auth/facebook/secrets"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({username:profile.displayName, facebookId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));

app.get('/', (req, res) => {
    res.render('home');
});
app.get('/auth/google',
  passport.authenticate('google', { scope: ["profile"] }));
  app.get('/auth/google/secrets', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect secrets.
    res.redirect('/secrets');
  });

app.get('/auth/facebook',
  passport.authenticate('facebook'));
app.get('/auth/facebook/secrets',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/secrets');
  });


app.get('/login', (req, res) => {
    res.render('login');
});
app.post('/login', (req, res) => {
    const user =new User({
        username:req.body.username,
        passport:req.body.password
    });
    req.logIn(user,(err)=>{
        if(!err){
                passport.authenticate("local")(req,res,function(){
                      res.redirect("/secrets");    
                });
        }        
        else
            res.status(400).send({message:"Either username or password is wrong"});

    });
});

app.get('/register', (req, res) => {
    res.render('register');
});
app.post('/register', (req, res) => {
    User.register({username:req.body.username,key:req.body.key},req.body.password,(err,user)=>{
        if(!err)
            {
             passport.authenticate("local")(req,res,function(){
                       res.redirect("/secrets");    
            });
            
        }
        else{
            console.log(err);
            res.status(400).send(err);
        }
    });
});
app.get("/secrets",(req,res)=>{
    let x=[];
    let user='';
    User.findById({_id:req.user._id},(err,response)=>{
        if(!err)
            user=response.username;
        else 
            console.log(err);
    });
    if(req.isAuthenticated()){
        User.find({secret:{$ne:null}},(err,founds)=>{
            if(!err)
            {
                if(founds)
                {
                    founds.forEach((data)=>{
                        for(let i=0;i<data.secret.length;i++){
                            x.push(data.secret[i]);
                        }
                    });
                    res.render("secrets",{data:x,username:user});
                }
            }
            else console.log(err);
        });
    }
    else
        res.redirect("/login");
    
});
app.get("/logout",(req,res)=>{
    req.logOut();
    res.redirect("/");
});
app.get("/submit",(req,res)=>{
    if(req.isAuthenticated()){
        User.findById({_id:req.user._id},(err,response)=>{
        if(!err)
            res.render("submit",{username:response.username});
        else 
            console.log(err);
    });
        
    }
    else
        res.redirect("/login");
});
app.get("/personal",(req,res)=>{
    if(req.isAuthenticated()){
        User.findById(req.user._id,(err,response)=>{
        if(!err)
            res.render("personal",{data:response.secret,username:response.username});
        else 
            console.log(err);
        });
    }
});

app.post("/forgotPass",(req,res)=>{
        User.findOne({username:req.body.username,key:req.body.key},(err,response)=>{
            User.findByIdAndDelete(response._id).populate("user").exec((err,docs)=>{
                if(err)
                    res.status(400).send(err);
                else{
                    User.register({username:req.body.username,key:req.body.key,secret:response.secret},req.body.password,(err,user)=>{
                    if(!err){
                        passport.authenticate("local")(req,res,function(){
                        res.redirect("/secrets");    
                        });
                    }
                    else{
                        console.log(err);
                        res.status(400).send(err);
                        }
                    });
                }
                    
            });
            
        });      
});
app.get("/forgot",(req,res)=>{
    res.render("forgot");
});
app.post("/submit",(req,res)=>{
    const d = new Date();
    let hrs=0,str='AM';
    if(d.getHours()>12){
        hrs=d.getHours()-12;
        str='PM';
    }
    else if(d.getHours()==0){
        hrs=12;
    }
    else {
        hrs=d.getHours();
    }
    let secs=d.getSeconds()<10?("0"+d.getSeconds().toString):d.getSeconds();
    let mins=d.getMinutes()<10?("0"+d.getMinutes().toString):d.getMinutes();
    const metaString=weekday[d.getDay()]+' '+hrs+':'+mins+':'+secs+' '+str+' '+d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear();
    const submittedSecret=req.body.secret;
    const title=req.body.title;
    const id=req.user._id+weekday[d.getDay()]+hrs+':'+mins+':'+secs+str+d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear();
    User.findById(req.user._id,(err,response)=>{
        if(!err){
            const blog={
                bio:metaString,
                user:req.body.status=="Anonymous"?req.body.status:response.username,
                title:title,
                text:submittedSecret,
                id:id
            }
            response.secret.push(blog);
            response.save((err)=>{
                if(!err)
                    res.redirect("/secrets");
                else
                    console.log(err);
            });
        }
        else console.log(err);
    });
});
app.post("/deleteblog",(req,res)=>{
    let array=[];
    for(let i=0;i<req.user.secret.length;i++)
            if(req.user.secret[i].id!=req.body.id)
                array.push(req.user.secret[i]);
    User.findByIdAndUpdate(req.user._id,{secret:array},(err,response)=>{
        if(err) res.status(400).send(err);
        else res.redirect("/personal");
    });    
});
app.get("/deleteacc",(req,res)=>{
    if(req.isAuthenticated()){
        let id=req.user._id;
        req.logOut();
        User.findByIdAndDelete({_id:id}).exec((err,docs)=>{
            res.redirect("/");
        });
    }
});
app.listen(process.env.PORT, () => {
    console.log("Server is running on allocated port:"+process.env.PORT);
});