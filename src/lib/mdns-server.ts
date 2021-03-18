import flatten      from 'array-flatten'
import { ServiceRecord } from './service'

const MulticastDNS  = require('multicast-dns')
const dnsEqual      = require('dns-equal')
const deepEqual    = require('deep-equal')

export class Server {

    public mdns         : any
    private registry    : any = {}

    constructor(opts: any) {
        this.mdns = MulticastDNS(opts)
        this.mdns.setMaxListeners(0)
        this.mdns.on('query', this.respondToQuery.bind(this))

    }

    public register(records: Array<ServiceRecord> | ServiceRecord) {
        // Register a record
        const shouldRegister = (record: ServiceRecord) => {
            var subRegistry = this.registry[record.type]
            if (!subRegistry) {
                subRegistry = this.registry[record.type] = []
            } else if(subRegistry.some(this.isDuplicateRecord(record))) {
                return
            }
            subRegistry.push(record)
        }

        if(Array.isArray(records)) {
            // Multiple records
            records.forEach(shouldRegister)
        } else {
            // Single record
            shouldRegister(records as ServiceRecord)
        }
    }

    public unregister(records: Array<ServiceRecord> | ServiceRecord) {
        // Unregister a record
        const shouldUnregister = (record: ServiceRecord) => {
            let type = record.type
            if(!(type in this.registry)) {
                return
            }
            this.registry[type] = this.registry[type].filter((i: ServiceRecord) => i.name !== record.name)
        }

        if(Array.isArray(records)) {
            // Multiple records
            records.forEach(shouldUnregister)
        } else {
            // Single record
            shouldUnregister(records as ServiceRecord)
        }
    }

    private respondToQuery(query: any) {
        let self = this
        query.questions.forEach((question: any) => {
            var type = question.type
            var name = question.name
        
            // generate the answers section
            var answers = type === 'ANY'
              ? flatten.depth(Object.keys(self.registry).map(self.recordsFor.bind(self, name)), 1)
              : self.recordsFor(name, type)
        
            if (answers.length === 0) return
        
            // generate the additionals section
            var additionals: Array<any> = []
            if (type !== 'ANY') {
              answers.forEach((answer: any) => {
                if (answer.type !== 'PTR') return
                additionals = additionals
                  .concat(self.recordsFor(answer.data, 'SRV'))
                  .concat(self.recordsFor(answer.data, 'TXT'))
              })
        
              // to populate the A and AAAA records, we need to get a set of unique
              // targets from the SRV record
              additionals
                .filter(function (record) {
                  return record.type === 'SRV'
                })
                .map(function (record) {
                  return record.data.target
                })
                .filter(this.unique())
                .forEach(function (target) {
                  additionals = additionals
                    .concat(self.recordsFor(target, 'A'))
                    .concat(self.recordsFor(target, 'AAAA'))
                })
            }
        
            self.mdns.respond({ answers: answers, additionals: additionals }, (err: any) => {
              if (err) throw err
            })
        })
    }

    private recordsFor(name: string, type: string) {
        if (!(type in this.registry)) {
            return []
        }
      
        return this.registry[type].filter((record: ServiceRecord) => {
          var _name = ~name.indexOf('.') ? record.name : record.name.split('.')[0]
          return dnsEqual(_name, name)
        })
    }
      
    private isDuplicateRecord (a: ServiceRecord) {
        return (b: ServiceRecord) => {
            return a.type === b.type &&
                a.name === b.name &&
                deepEqual(a.data, b.data)
        }
    }
      
    private unique () {
        var set: Array<any> = []
        return (obj: any) => {
            if (~set.indexOf(obj)) return false
            set.push(obj)
            return true
        }
    }

}

export default Server