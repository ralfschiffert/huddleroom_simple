// helper lib to create a json webtoken for guest
const jwt = require('jsonwebtoken')
const teams = require('ciscospark').init({})
// support http requests
const got = require('got')

// we use Twilio to call the space and do record the interaction
// meetings will continue after participant hangs up, so this could be used to just
// start the meeting and then drop off from the call - the behavior is largely a business decision
const twilio = require('twilio')(process.env.SNSUBACC, process.env.SNSUBACC_TOKEN)

// if the concept of a guest issuer is new to you please read the doc here
// https://developer.webex.com/docs/guest-issuer
const guestIssuerId = process.env.GUEST_ISSUER_ID
const guestSharedSecret = process.env.GUEST_ISSUER_SHARED_SECRET

// from our registered guest issuer app we will now create a guest token
// this token can be used to put people into a huddle room
// it will also be used to call the space to start the meeting
let payload = {
  "sub": "ServiceNow Dispatcher",
  "name": "ServiceNow Dispatcher",
  "iss": guestIssuerId
}

// the emails should have a Webex Teams accounts
let peopleToAdd = ['ab@test.de', 'def@test.com', 'guglhupf@hotmail.com']

// HMACSHA256 is the default for this lib
// for the guest token for practical purposes we are using a 24 hour expiration
const guestToken = jwt.sign(payload, Buffer.from(guestSharedSecret, 'base64'), { expiresIn: '24h' })

// console.log("guestToken:" + guestToken)


let myApp = {
  roomId: "",
  roomSipUri: "",
  roomTitle: "unnamed space",
  members: [],
  people2Remind: [],
  callSid: "",
  webhookurl: "",
  init:  function(roomTitle) {
    this.roomTitle = roomTitle
    teams.authorization.requestAccessTokenFromJwt({jwt: guestToken})
      .then(  () => { return this.createSpace(roomTitle)} )
      .then( (r) => {this.roomId = r.id;  return this.lookupSpaceDetails(r.id)})
      .then( (r) => { this.roomSipUri = r.sipAddress; console.log(r.sipAddress)} )
      .then( () => { return this.addMembersByEmail2Space(peopleToAdd)})
      .then( () => { this.postMessage("Welcome to the " + roomTitle + " huddle space")})
      .then( () => { return this.callSpace() })
      .then( call =>  this.callSid = call.sid )
      .catch(console.log)
  },
  createSpace: function(roomTitle) {
    return teams.rooms.create( {title: roomTitle} )
  },
  lookupSpaceDetails: function(roomId) {
    // we need to do thjs to access the SIP URI of this space, which is not returned in the room creation
    return teams.rooms.get(roomId)
  },
  addMembersByEmail2Space: function(people) {
    return Promise.all(
      people.map( (m) => {
        return teams.memberships.create({ roomId: this.roomId, personEmail: m})
      }))
  },
  postMessage: function(msg) {
    return teams.messages.create({roomId: this.roomId, text: msg})
  },
  callSpace: function() {
    // the Twiml here looks like
    // <?xml version="1.0" encoding="UTF-8"?>
    // <Response>
    // <Say> Thank you for joining our huddle space </Say>
    // <Record/>
    // </Response>
    // and can be used to record the interaction

    // an alternative Twiml which would be more cost efficient is to have the
    // SIP leg drop off after the user joined. This could be done simply by omitting
    // record tag

    // we call the space via Twilio sip calling. Any SIP call with TLS support will suffice
    return twilio.calls.create({
      'url':'https://handler.twilio.com/twiml/EH3f6b0b685271d2c06b9df0cd19b16ef4',
      'to': 'sip:' + this.roomSipUri + ';transport=tls',
      'from': 'ServiceNowDispatcher'
    })
  },
}

myApp.init('Incident 113')
