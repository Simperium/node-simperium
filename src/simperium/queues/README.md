# Channel Queues

These queues were originally in the Channel module. They have been extracted
and flowtyped to improve code quality and clarify the API.

## LocalQueue

Each `Channel` instance has a single `LocalQueue` that tracks changes that are sent
are pending to be sent to simperium.

As bucket objects are updated, the `Channel` will reference this queue to determine
when an object should be sent. It also uses the `LocalQueue` to report if a bucket object
is currently being synced or not.

## NetworkQueue

Each `Channel` instance has a single `NetworkQueue`. As changes are received from simperium,
the channel will apply the changes in sequence. Together with the `LocalQueue` the channel
will be able to determine when pending changes in the `LocalQueue` have been accepted or
rejected by the server.

## Queue

A generic queue object used by `LocalQueue` and `RemoteQueue` that sequences tasks as
first-in-first-out execution order.
