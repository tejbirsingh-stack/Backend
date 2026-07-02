// Organizations Controller

//1. Get organizations
module.exports.getOrganizations = async (request, reply) => {
    try{
      const orgs = await request.server.prisma.organization.findMany({
        select : {
          id: true,
          name: true,
        }
      });
      reply.send(orgs);
    }catch (err){
      request.log.error(err);
      reply.status(500).send({ error: "Failed to fetch organizations" });
    }
};


//2. Get single organization
module.exports.getSingleOrganization = async (request, reply) => {
    reply.send({message: `Organization ${request.params.id} endpoint not yet implemented`});
};

//3. Create organization
module.exports.createOrganization = async (request, reply) => {
    reply.send({message: "Organization creation endpoint not yet implemented"});
};
