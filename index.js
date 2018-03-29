/*******************************************************************************************

    NOTES

    I interpreted time slightly differently for this challenge.  In the original
    challenge, for reminders, an invitation or message is considered a day old
    if it no longer the day it was created.  I interpreted it strictly in terms
    of 24 hours having been passed since the creation of the message or invitation.
    Ditto for week calculations.

    I only had time to make tests for the Tuesday scenario, but all the underlying
    methods are tested, and hopefully you get a sense of what the rest of the tests
    would look like.

*******************************************************************************************/

const moment = require('moment')
const cron = require('cron')
const test = require('tape');
const uuidv1 = require('uuid/v1')


/* MODELS */

class Candidate {
  constructor(name) {
    this.name = name
    this.id = uuidv1()
    this.reminders = []
    this.invitationIds = []
    this.messageIds = []
  }
}


class School {
  constructor(name) {
    this.name = name
    this.id = uuidv1()
    this.invitationIds = []
    this.messageIds = []
  }
}


class Invitation {
  constructor({ candidateId, schoolId, text, createdAt }) {
    this.createdAt = createdAt || moment().format()
    this.id = uuidv1()
    this.candidateId = candidateId
    this.schoolId = schoolId
    this.text = text
    this.status = 'pending' // enum ['pending' | 'accepted' | rejected ]
    this.dateResolved = undefined
  }
}


class Message {
  constructor({ candidateId, schoolId, text, createdAt }) {
    this.createdAt = createdAt || moment().format()
    this.id = uuidv1()
    this.candidateId = candidateId
    this.schoolId = schoolId
    this.text = text
    this.readAt = undefined
  }
}


class DataBase {
  constructor() {
    this.candidates = {}
    this.schools = {}
    this.invitations = {}
    this.messages = {}
    this.jobs = []
  }

  // add to the db
  addEntity(branch, entity) {

    // should throw error here
    if (!branch || !entity) {
      console.log('MUST PROVIDE A branch AND entity')
      return
    }

    // should throw error here
    if (!this[branch]) {
      console.log('MUST PROVIDE a valid db branch to operate on')
      return
    }

    if (branch == 'invitations' || branch == 'messages') {
      if (!this.schools[entity.schoolId]) {
        console.log('NO SCHOOL WITH THAT ID exists')
      }

      if (!this.candidates[entity.candidateId]) {
        console.log('NO Candidate WITH THAT ID exists')
      }

      // update related candidate and school entities
      this.candidates[entity.candidateId][ branch == 'messages' ? 'messageIds' : 'invitationIds' ].push(entity.id)
      this.schools[entity.schoolId][ branch == 'messages' ? 'messageIds' : 'invitationIds' ].push(entity.id)

    }

    this[branch][entity.id] = entity
  }

  // delete from the db
  deleteEntity(branch, entity) {

    // validation
    if (!branch || !entity) {
      console.log('MUST PROVIDE a branch and entity')
      return
    }
    this[branch][entity.id] = entity
  }

  updateEntity(branch, updateFunction) {

    // validation
    if (!branch || !entity) {
      console.log('MUST PROVIDE a branch and updateFunction')
      return
    }

    this[branch][entity.id] = updateFunction(this[branch][entity.id])

  }

  /* Gets all the message id's that are unread and over a day old */
  getCandidateMessagesForReminder(candidateId) {

    const candidate = this.candidates[candidateId]

    return candidate.messageIds

      // get messages from ids
      .map(messageId => this.messages[messageId])

      // filter messages that have been read or are newer than a day
      .filter(message => !message.readAt && determineReminderType(message) )
  }

  getCandidateInvitationsForReminder(candidateId) {
    const candidate = this.candidates[candidateId]

    return candidate.invitationIds

      // get invitations from ids
      .map(invitationId => this.invitations[invitationId])

      // filter messages that have been replied to or are newer than a day
      .filter(invitation => invitation.status == 'pending' && determineReminderType(invitation))
  }

  readMessage(messageId, readAt) {
    if (!this.messages[messageId]) {
      console.log('NO MESSAGE WITH THAT ID EXISTS')
      return
    }
    this.messages[messageId].readAt = readAt || moment().format()
  }

  replyToInvitation(invitationId, reply) {
    if (!this.invitations[invitationId]) {
      console.log('NO INVITATION WITH THAT ID EXISTS')
      return
    }
    this.invitations[invitationId].status = reply || 'accepted'
  }

  sendNotifications() {
    Object.keys(this.candidates).forEach(candidateId => {
      const candidate = this.candidates[candidateId]

      // check if candidate should receive a notification
      if (
        !candidateWasRemindedToday(candidate) &&
        !candidateReceivedMaximumWeeklyReminders(candidate)
      ) {

        // get unread messages
        const messagesForReminder = this.getCandidateMessagesForReminder(candidateId)

        // get pending invitations
        const invitationsForReminder = this.getCandidateInvitationsForReminder(candidateId)

        // track all reminder-worthy messages or invitations
        let newReminders = { nudge: [], warning: [], notice: [] }

        // initialize the reminder that will be added to the candidate's reminders
        let newReminder = { createdAt: moment().format() }

        // check that there are any reminder-worthy messages
        if (messagesForReminder.length > 0) {

          // populate newReminders object
          messagesForReminder.forEach(message => {
            const reminderType = determineReminderType(message)
            if (reminderType) {
              newReminders[reminderType].push(message.id)
            }
          })

          // decide what status of messages to send as reminder
          if (newReminders.notice.length > 0) {

            candidate.reminders.push({
              entityType: 'messages',
              urgencyStatus: 'notice',
              createdAt: moment().format(),
              entityIds: newReminders.notice
            })

          } else if (newReminders.warning.length > 0) {

            candidate.reminders.push({
              entityType: 'messages',
              urgencyStatus: 'warning',
              createdAt: moment().format(),
              entityIds: newReminders.warning
            })

          } else if (newReminders.nudge.length > 0) {

            candidate.reminders.push({
              entityType: 'messages',
              urgencyStatus: 'nudge',
              createdAt: moment().format(),
              entityIds: newReminders.nudge
            })

          }

        // if no reminder-worthy messges, check for reminder-worthy invitations
        } else if (invitationsForReminder.length > 0) {

          // populate newReminders object
          invitationsForReminder.forEach(invitation => {
            const reminderType = determineReminderType(invitation)
            if (reminderType) {
              newReminders[reminderType].push(invitation.id)
            }
          })

          // decide what status of messages to send as reminder
          if (newReminders.notice.length > 0) {

            candidate.reminders.push({
              entityType: 'invitations',
              urgencyStatus: 'notice',
              createdAt: moment().format(),
              entityIds: newReminders.notice
            })

          } else if (newReminders.warning.length > 0) {

            candidate.reminders.push({
              entityType: 'invitations',
              urgencyStatus: 'warning',
              createdAt: moment().format(),
              entityIds: newReminders.warning
            })

          } else if (newReminders.nudge.length > 0) {

            candidate.reminders.push({
              entityType: 'invitations',
              urgencyStatus: 'nudge',
              createdAt: moment().format(),
              entityIds: newReminders.nudge
            })

          }
        }

      }
    })
  }

  // configure and start the cronjobs
  startCronJobs(days = ['1-5'], times = [['6', '0'], ['12', '0'], ['18', '0']]) {
    const CronJob = cron.CronJob
    days.forEach(day => {
      times.forEach(time => {
        const hour = time[0] | '0'
        const minute = time[1] || '0'

        // configure and start cronjob
        const job = new CronJob(
          `0 ${minute} ${hour} * * ${day}`,
          () => { this.sendNotifications() },
          () => { console.log('cronjobs have stopped running') },
          true
        )

        this.jobs.push(job)

      })
    })
  }

}


/* NOTIFICATION LOGIC helper functions */

function determineReminderType (entity) {

  const timeElapsed = moment().diff(entity.createdAt, 'days', true)

  if (timeElapsed < 1) {
    return
  } else if (timeElapsed > 1 && timeElapsed <= 3) {
    return 'nudge'
  } else if (timeElapsed > 3 && timeElapsed <= 7) {
    return 'warning'
  } else {
    return 'notice'
  }

}


function candidateWasRemindedToday (candidate) {
  return candidate.reminders.some(reminder => moment().diff(reminder.createdAt, 'days', true) < 1)
}


function candidateReceivedMaximumWeeklyReminders (candidate) {
  return candidate.reminders
    .filter(reminder => moment().diff(reminder.createdAt, 'days', true) < 7)
    .length >= 3
}



/* TESTING */

test('determineReminderType returns the correct reminder urgency status', function (t) {

    const db = new DataBase()
    const John = new Candidate('John')
    const A = new School('A')

    db.addEntity('candidates', John)
    db.addEntity('schools', A)

    const recentlyCreatedMessage = new Message({ candidateId: John.id, schoolId: A.id })

    const nudgeWorthyMessage = new Message({ candidateId: John.id, schoolId: A.id, createdAt: moment().subtract(2, 'days').format() })

    const warningWorthyMessage = new Message({ candidateId: John.id, schoolId: A.id, createdAt: moment().subtract(5, 'days').format() })

    const noticeWorthyMessage = new Message({ candidateId: John.id, schoolId: A.id, createdAt: moment().subtract(8, 'days').format() })

    t.equal(
      determineReminderType(recentlyCreatedMessage),
      undefined,
      'a message just created has an undefined reminder status'
    )

    t.equal(
      determineReminderType(nudgeWorthyMessage),
      'nudge',
      'a message created 2 days ago has a nudge reminder status'
    )

    t.equal(
      determineReminderType(warningWorthyMessage),
      'warning',
      'a message created 5 days ago has a warning reminder status'
    )

    t.equal(
      determineReminderType(noticeWorthyMessage),
      'notice',
      'a message created 8 days ago has a notice reminder status'
    )

    t.end()
})


test('determining whether a candidate should receive any notifications', function (t) {

    const Aaron = new Candidate({ name: 'Aaron' })

    Aaron.reminders.push({
      createdAt: moment().subtract(2, 'days').format(),
    })

    t.notOk(
      candidateWasRemindedToday(Aaron),
      'candidate with most recent reminder 2 days ago was not reminded today'
    )

    Aaron.reminders.push({
      createdAt: moment().format(),
    })

    t.ok(
      candidateWasRemindedToday(Aaron),
      'candidate just reminded has been reminded today'
    )

    Aaron.reminders.push({
      createdAt: moment().subtract(8, 'days').format(),
    })

    t.notOk(
      candidateReceivedMaximumWeeklyReminders(Aaron),
      'candidate with only two reminders in the past week has not received maximum weekly reminders'
    )

    Aaron.reminders.push({
      createdAt: moment().subtract(3, 'days').format(),
    })

    t.ok(
      candidateReceivedMaximumWeeklyReminders(Aaron),
      'candidate with three reminders in the past week has received maximum weekly reminders'
    )

    t.end()
})


test('getCandidateMessagesForReminder retrieves all candidate\'s messages he needs to be reminded of', function (t) {

  const db = new DataBase()
  const John = new Candidate('John')
  const A = new School('A')

  db.addEntity('candidates', John)
  db.addEntity('schools', A)

  // John does not receive
  t.deepEqual(
    db.getCandidateMessagesForReminder(John.id),
    [],
    'getCandidateMessagesForReminder returns empty array when candidate has no messages'
  )

  const brandNewMessage = new Message({ candidateId: John.id, schoolId: A.id })

  // add a message for John
  db.addEntity('messages', brandNewMessage)

  t.deepEqual(
    db.getCandidateMessagesForReminder(John.id),
    [],
    'getCandidateMessagesForReminder returns empty array when candidate has 1 message less than a day old'
  )

  const olderMessage = new Message({ candidateId: John.id, schoolId: A.id, createdAt: moment().subtract(2, 'days').format() })

  // add old message for John
  db.addEntity('messages', olderMessage)


  t.equal(
    db.getCandidateMessagesForReminder(John.id).length,
    1,
    'getCandidateMessagesForReminder returns array length 1 after an old message is added for a candidate'
  )

  // read the older message
  db.readMessage(olderMessage.id)

  t.deepEqual(
    db.getCandidateMessagesForReminder(John.id),
    [],
    'getCandidateMessagesForReminder returns empty array when candidate has a new message and a read message'
  )


  t.end()
})


test('getCandidateInvitationsForReminder retrieves all candidate\'s invitations he needs to be reminded of', function (t) {

  const db = new DataBase()
  const John = new Candidate('John')
  const A = new School('A')

  db.addEntity('candidates', John)
  db.addEntity('schools', A)

  // John does not receive
  t.deepEqual(
    db.getCandidateInvitationsForReminder(John.id),
    [],
    'getCandidateInvitationsForReminder returns empty array when candidate has no invitations'
  )

  const brandNewInvitation = new Invitation({ candidateId: John.id, schoolId: A.id })

  // add a message for John
  db.addEntity('invitations', brandNewInvitation)

  t.deepEqual(
    db.getCandidateInvitationsForReminder(John.id),
    [],
    'getCandidateInvitationsForReminder returns empty array when candidate has 1 invitation less than a day old'
  )

  const olderInvitation = new Invitation({ candidateId: John.id, schoolId: A.id, createdAt: moment().subtract(2, 'days').format() })

  // add old message for John
  db.addEntity('invitations', olderInvitation)

  t.equal(
    db.getCandidateInvitationsForReminder(John.id).length,
    1,
    'getCandidateInvitationsForReminder returns array length 1 after an old invitation is added for a candidate'
  )

  // read the older message
  db.replyToInvitation(olderInvitation.id)

  t.deepEqual(
    db.getCandidateInvitationsForReminder(John.id),
    [],
    'getCandidateInvitationsForReminder returns empty array when candidate has a new invitation and a replied to invitation'
  )


  t.end()
})




// create entities for the scenario

const John = new Candidate('John')
const A = new School('A')
const B = new School('B')
const C = new School('C')
const D = new School('D')



test('TUESDAY @ noon', function(t) {

  const db = new DataBase()
  db.addEntity('candidates', John)
  db.addEntity('schools', A)
  db.addEntity('schools', B)
  db.addEntity('schools', C)
  db.addEntity('schools', D)

  /*

  MONDAY:

  ○ School A sends an invite at 8:30am
  ○ School B sends an invite at 11:45am
  ○ School C sends an invite at 12:20pm
  ○ John accepts only School B at 4:20pm

  */

  // School A sends an invite at MONDAY 8:30am
  const schoolAInvitation = new Invitation({ candidateId: John.id, schoolId: A.id, createdAt: moment().subtract(24*1.25, 'hours').format() })
  db.addEntity('invitations', schoolAInvitation)

  // School B sends an invite at MONDAY 11:45am
  const schoolBInvitation = new Invitation({ candidateId: John.id, schoolId: B.id, createdAt: moment().subtract(24*1.01, 'hours').format() })
  db.addEntity('invitations', schoolBInvitation)

  // School C sends an invite at MONDAY 12:20pm
  const schoolCInvitation = new Invitation({ candidateId: John.id, schoolId: C.id, createdAt: moment().subtract(24*0.99, 'hours').format() })
  db.addEntity('invitations', schoolCInvitation)

  // School D sends an invite at TUESDAY 11:50am
  const schoolDInvitation = new Invitation({ candidateId: John.id, schoolId: D.id, createdAt: moment().subtract(10, 'minutes').format() })
  db.addEntity('invitations', schoolDInvitation)

  // John accepts only School B at 4:20pm
  db.replyToInvitation(schoolBInvitation.id)

  // notification sent
  db.sendNotifications()

  t.equal(
    John.reminders.length,
    1,
    'John should have received 1 reminder'
  )

  const reminder = John.reminders[0]

  t.equal(
    reminder.urgencyStatus, 'nudge',
    'the reminder is for a nudge'
  )

  t.equal(
    reminder.entityType, 'invitations',
    'the reminder is for invitations'
  )

  t.equal(
    reminder.entityIds.length, 1,
    'the reminder is for a single invitation'
  )

  t.equal(
    reminder.entityIds[0], schoolAInvitation.id,
    'the invitation is from school A'
  )

  t.end()

})
